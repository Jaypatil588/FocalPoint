from fastapi import APIRouter, Query, HTTPException
from db.mongo import get_db
from db.policies import get_active_policy, get_policy
from db.memories import get_semantic_memories
from services.evaluation import deterministic_evaluation

router = APIRouter(prefix="/inspect")


@router.get("/policies")
def policies(user_id: str, limit: int = Query(20, ge=1, le=100)):
    active = get_active_policy(user_id)
    records = list(get_db().policies.find({"user_id": user_id}, {"_id": 0}).sort("created_at", -1).limit(limit))
    return {"active_policy_id": active.policy_id, "policies": records}


@router.get("/memory")
def memory(user_id: str, session_id: str):
    db = get_db()
    session = db.sessions.find_one({"_id": session_id, "user_id": user_id}, {"_id": 0, "messages": 1})
    return {"working": [] if session is None else session["messages"],
            "episodic": list(db.episodes.find({"user_id": user_id, "session_id": session_id}, {"_id": 0}).sort("timestamp", -1).limit(30)),
            "semantic": [item.model_dump() for item in get_semantic_memories(user_id)],
            "procedural": get_active_policy(user_id).model_dump()}


@router.get("/runs")
def runs(user_id: str, limit: int = Query(20, ge=1, le=100)):
    return list(get_db().runs.find({"user_id": user_id}, {"_id": 0, "spans": 0, "response": 0}).sort("started_at", -1).limit(limit))


@router.get("/runs/{run_id}")
def run_detail(run_id: str, user_id: str):
    record = get_db().runs.find_one({"_id": run_id, "user_id": user_id}, {"_id": 0})
    if record is None:
        raise HTTPException(404, "run not found")
    return record


@router.get("/evaluations")
def evaluations(user_id: str, limit: int = Query(20, ge=1, le=100)):
    return list(get_db().evaluations.find({"user_id": user_id}, {"_id": 0, "cases": 0}).sort("created_at", -1).limit(limit))


@router.get("/evaluations/{evaluation_id}")
def evaluation_detail(evaluation_id: str, user_id: str):
    record = get_db().evaluations.find_one({"_id": evaluation_id, "user_id": user_id}, {"_id": 0})
    if record is None:
        raise HTTPException(404, "evaluation not found")
    return record


@router.post("/policies/{policy_id}/regression")
def regression(policy_id: str, user_id: str):
    return deterministic_evaluation(get_policy(user_id, policy_id))
