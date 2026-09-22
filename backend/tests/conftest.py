import os
import uuid
import pytest
from fastapi.testclient import TestClient
from pymongo import MongoClient
from models import ModelResult
from db import mongo
from main import app


@pytest.fixture
def database(monkeypatch):
    uri = os.getenv("TEST_MONGODB_URI", "mongodb://127.0.0.1:27028/?replicaSet=focalpoint")
    client = MongoClient(uri, serverSelectionTimeoutMS=3000, retryWrites=False, retryReads=False)
    client.admin.command("ping")
    assert client.admin.command("hello").get("setName"), "integration tests require real replica-set MongoDB"
    name = "focalpoint_test_" + uuid.uuid4().hex
    monkeypatch.setattr(mongo, "_client", client)
    monkeypatch.setenv("MONGODB_DB_NAME", name)
    yield client[name]
    client.drop_database(name)
    client.close()


@pytest.fixture
def api(database):
    with TestClient(app) as client:
        yield client


@pytest.fixture
def model(monkeypatch):
    from services import llm
    calls = []
    def generate(system, query, history=(), **kwargs):
        calls.append((system, query, history))
        return ModelResult(text="A bounded test response.", provider="test-double", model="fixture",
                           temperature=0.0, max_output_tokens=2048, input_tokens=100, output_tokens=10)
    monkeypatch.setattr(llm, "generate", generate)
    return calls


def request(**updates):
    return {"user_id": "test_user", "session_id": "test_session", "request_id": uuid.uuid4().hex,
            "message": "Explain recursion", **updates}
