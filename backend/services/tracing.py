import hashlib
import json
import logging
import time
import uuid
from contextlib import contextmanager
from pymongo.errors import DuplicateKeyError
from db.mongo import get_db
from services.policy_defaults import now
from models import RunSpan

logger = logging.getLogger("focalpoint.runs")


class ConflictError(ValueError):
    pass


def digest(value) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


class RunTrace:
    def __init__(self, run_type: str, request):
        self.db = get_db()
        self.run_id = f"{request.user_id}:{request.request_id}"
        self.started = time.perf_counter()
        self.finished = False
        self.cached = None
        self.document = {
            "_id": self.run_id, "run_id": self.run_id, "trace_id": uuid.uuid4().hex,
            "run_type": run_type, "user_id": request.user_id, "session_id": request.session_id,
            "request_hash": digest({"kind": run_type, **request.model_dump()}),
            "status": "running", "started_at": now(), "spans": [],
        }
        try:
            self.db.runs.insert_one(self.document.copy())
        except DuplicateKeyError:
            existing = self.db.runs.find_one({"_id": self.run_id})
            if existing["request_hash"] != self.document["request_hash"]:
                raise ConflictError("request_id already used with a different payload")
            if existing["status"] != "completed":
                raise ConflictError(f"request already {existing['status']}; an explicit retry needs a new request_id")
            self.cached = existing["response"]

    @contextmanager
    def span(self, name: str, inputs=None):
        if len(self.document["spans"]) >= 64:
            raise RuntimeError("run exceeded its 64-stage budget")
        stage = {"name": name, "started_at": now(), "status": "running",
                 "input": {} if inputs is None else inputs, "output": {}}
        started = time.perf_counter()
        self._stage_started = started
        self.document["spans"].append(stage)
        try:
            yield stage
            stage["status"] = "completed"
        except Exception as error:
            stage["status"] = "failed"
            stage["error"] = f"{type(error).__name__}: {error}"
            raise
        finally:
            stage["duration_ms"] = round((time.perf_counter() - started) * 1000, 2)
            RunSpan.model_validate(stage)
            logger.info(json.dumps({"run_id": self.run_id, "stage": name,
                                    "status": stage["status"], "duration_ms": stage["duration_ms"]}))
            if not self.finished:
                self.db.runs.update_one({"_id": self.run_id}, {"$set": {"spans": self.document["spans"]}})

    def summary(self):
        return {"trace_id": self.document["trace_id"], "run_id": self.run_id,
                "duration_ms": round((time.perf_counter() - self.started) * 1000, 2),
                "spans": [{key: stage[key] for key in ("name", "status")}
                          for stage in self.document["spans"]]}

    def complete(self, response: dict, transaction):
        if self.document["spans"]:
            stage = self.document["spans"][-1]
            stage["status"] = "completed"
            stage["duration_ms"] = round((time.perf_counter() - self._stage_started) * 1000, 2)
        response["trace"] = self.summary()
        result = self.db.runs.update_one({"_id": self.run_id, "status": "running"}, {"$set": {
            "status": "completed", "ended_at": now(), "response": response,
            "duration_ms": round((time.perf_counter() - self.started) * 1000, 2),
            "spans": self.document["spans"],
        }}, session=transaction)
        if result.modified_count != 1:
            raise ConflictError("run already finalized")

    def fail(self, error: Exception):
        if not self.finished:
            self.db.runs.update_one({"_id": self.run_id, "status": "running"}, {"$set": {
                "status": "failed", "ended_at": now(), "spans": self.document["spans"],
                "error": f"{type(error).__name__}: {error}",
                "duration_ms": round((time.perf_counter() - self.started) * 1000, 2),
            }})
            self.finished = True
