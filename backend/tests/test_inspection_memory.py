import uuid
import pytest
from conftest import request
from test_chat import feedback
from services.memory import derive_memories
from services.policy_defaults import now
from db import mongo


def test_mem_02_dedup_and_conflicting_preference():
    episode = {'episode_id': 'one', 'reward': -0.5, 'user_message': 'Explain recursion',
               'gaze_events': [{'flag': 'confusion'}], 'profile_after': {'preferred_format': 'bullets'}}
    first, changed = derive_memories('user', episode, [])
    same, changed_again = derive_memories('user', episode, first)
    assert same == first and changed_again == []
    second, _ = derive_memories('user', {**episode, 'episode_id': 'two'}, first)
    preference = next(memory for memory in second if memory.key == 'preferred_format')
    assert preference.evidence_count == 2 and preference.confidence > first[1].confidence
    third, _ = derive_memories('user', {**episode, 'episode_id': 'three', 'reward': 1.0,
                                       'profile_after': {'preferred_format': 'prose'}}, second)
    preference = next(memory for memory in third if memory.key == 'preferred_format')
    assert preference.content == 'Prefer prose formatting.'
    assert preference.episode_ids == ['one', 'two', 'three']


def test_mem_04_obs_02_scoped_inspection(api, model, database):
    for _ in range(2):
        first = api.post('/chat', json=request()).json()
        second = api.post('/chat', json=request(previous_response_id=first['response_id'], gaze_events=feedback(first['response_id'])))
        assert second.status_code == 200
    current = api.get('/inspect/memory?user_id=test_user&session_id=test_session').json()
    assert len(current['working']) == 8
    assert len(current['episodic']) == 2
    assert current['semantic']
    other = api.get('/inspect/memory?user_id=other&session_id=test_session').json()
    assert other['working'] == other['episodic'] == other['semantic'] == []
    assert other['procedural']['user_id'] == 'other'
    continued = api.post('/chat', json=request(session_id='new_session')).json()
    trace = database.runs.find_one({'run_id': continued['trace']['run_id']})
    context = next(span['output'] for span in trace['spans'] if span['name'] == 'context.build')
    assert context['memories'] and context['history'] == []
    assert api.get('/inspect/evaluations/missing?user_id=test_user').status_code == 404
    assert api.get('/inspect/evaluations?user_id=test_user').json() == []
    assert len(api.get('/inspect/runs?user_id=test_user').json()) == 5
    policies = api.get('/inspect/policies?user_id=test_user').json()
    regression = api.post(f"/inspect/policies/{policies['active_policy_id']}/regression?user_id=test_user")
    assert regression.json()['passed']


def test_profile_validation_and_revision(api, database):
    before = api.get('/profile?user_id=test_user').json()
    assert before == {'complexity_score': 5, 'preferred_format': 'prose'}
    assert api.post('/profile', json={'user_id': 'test_user', 'profile': {'complexity_score': 100, 'preferred_format': 'prose'}}).status_code == 422
    assert api.post('/profile', json={'user_id': 'test_user', 'profile': {'complexity_score': 3, 'preferred_format': 'bullets'}}).status_code == 200
    assert database.users.find_one()['revision'] == 1


def test_env_02_database_missing(monkeypatch):
    monkeypatch.setattr(mongo, '_client', None)
    monkeypatch.delenv('MONGODB_URI', raising=False)
    with pytest.raises(RuntimeError, match='MONGODB_URI'): mongo.get_db()


def test_env_03_database_unreachable(monkeypatch):
    from pymongo.errors import ServerSelectionTimeoutError
    monkeypatch.setattr(mongo, '_client', None)
    monkeypatch.setenv('MONGODB_URI', 'mongodb://127.0.0.1:1')
    try:
        with pytest.raises(ServerSelectionTimeoutError): mongo.get_db().command('ping')
    finally:
        mongo._client.close()


def test_env_03_standalone_refuses_partial_commit(api, model, monkeypatch):
    import subprocess
    import selectors
    from pathlib import Path
    from pymongo import MongoClient
    root = Path(__file__).resolve().parents[2]
    process = subprocess.Popen(['node', 'scripts/mongo-standalone.mjs'], cwd=root,
                               stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    try:
        with selectors.DefaultSelector() as selector:
            selector.register(process.stdout, selectors.EVENT_READ)
            assert selector.select(timeout=30), 'standalone MongoDB did not start'
            uri = process.stdout.readline().strip()
        assert uri.startswith('mongodb://'), uri
        client = MongoClient(uri, serverSelectionTimeoutMS=3000)
        monkeypatch.setattr(mongo, '_client', client)
        monkeypatch.setenv('MONGODB_DB_NAME', 'standalone_test')
        result = api.post('/chat', json=request())
        assert result.status_code == 503
        db = client.standalone_test
        assert db.users.find_one()['revision'] == 0
        assert db.sessions.find_one()['messages'] == []
        assert db.runs.find_one()['status'] == 'failed'
        client.close()
    finally:
        process.terminate()
        process.communicate(timeout=15)
