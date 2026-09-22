from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
import uuid
import pytest
from pymongo.collection import Collection
from conftest import request
from services import llm
from services.chat_harness import ChatHarness
from models import ChatRequest, ModelResult


def feedback(response_id):
    return [{"zone": f"{response_id}:line_0", "visits": 4, "flag": "confusion"}]


def test_run_01_02_08_first_followup_restart_context(api, model, database):
    first = api.post('/chat', json=request()).json()
    second = api.post('/chat', json=request(message="Give an example", previous_response_id=first['response_id']))
    assert second.status_code == 200
    assert len(model[1][2]) == 2
    assert second.json()['reward'] is None
    assert database.users.find_one() ['complexity_score'] == 5
    session = api.get('/sessions?user_id=test_user').json()[0]
    assert len(session['messages']) == 4
    assert session['messages'][1]['responseId'] == first['response_id']
    assert session['messages'][1]['policy_id'] == first['policy_id']


def test_run_03_04_request_idempotency(api, model, database):
    payload = request()
    first = api.post('/chat', json=payload)
    again = api.post('/chat', json=payload)
    assert first.json() == again.json()
    assert len(model) == 1
    assert database.sessions.find_one()['turns'] == 1
    changed = api.post('/chat', json={**payload, 'message': 'different'})
    assert changed.status_code == 409


def test_run_04_in_progress_reservation(api, model):
    from services.tracing import RunTrace
    payload = request()
    RunTrace('chat', ChatRequest(**payload))
    response = api.post('/chat', json=payload)
    assert response.status_code == 409 and not model


def test_run_07_context_failure_before_generation(api, model, database):
    response = api.post('/chat', json=request(message='x' * 19000))
    assert response.status_code == 409 and not model
    assert database.users.find_one()['revision'] == 0
    assert database.runs.find_one()['spans'][-1]['name'] == 'context.build'
    assert database.runs.find_one()['status'] == 'failed'


def test_gaze_03_04_mem_01_03_feedback_provenance(api, model, database):
    first = api.post('/chat', json=request()).json()
    gaze = feedback(first['response_id'])
    second = api.post('/chat', json=request(message="Explain volcanoes", previous_response_id=first['response_id'], gaze_events=gaze))
    assert second.status_code == 200, second.text
    assert second.json()['user_profile']['complexity_score'] == 4
    episode = database.episodes.find_one()
    assert episode['user_message'] == 'Explain recursion'
    assert 'recursion' in episode['profile_after']['topics_to_simplify']
    assert 'volcanoes' not in episode['profile_after']['topics_to_simplify']
    count = database.memories.count_documents({})
    repeated = api.post('/chat', json=request(previous_response_id=first['response_id'], gaze_events=gaze))
    assert repeated.status_code == 200
    assert database.episodes.count_documents({}) == 1
    assert database.memories.count_documents({}) == count
    assert database.users.find_one()['complexity_score'] == 4
    assert all(item['episode_ids'] == [episode['episode_id']] for item in database.memories.find())
    changed = [{**gaze[0], 'visits': 5}]
    assert api.post('/chat', json=request(previous_response_id=first['response_id'], gaze_events=changed)).status_code == 409


@pytest.mark.parametrize('change', [
    {'message': ''}, {'message': '   '}, {'message': 'x' * 20001}, {'history': []},
    {'gaze_events': [{'zone': 'bad', 'visits': 1, 'flag': 'unknown'}]},
    {'previous_response_id': 'a', 'gaze_events': [{'zone': 'b:line_0', 'visits': 4, 'flag': 'confusion'}]},
])
def test_run_09_invalid_contract(api, model, change):
    assert api.post('/chat', json=request(**change)).status_code == 422
    assert not model


def test_gaze_05_cross_user_session_and_legacy(api, model, database):
    first = api.post('/chat', json=request()).json()
    payload = request(user_id='other', previous_response_id=first['response_id'], gaze_events=feedback(first['response_id']))
    assert api.post('/chat', json=payload).status_code == 404
    database.sessions.update_one({}, {'$unset': {'messages.1.policy_id': ''}})
    assert api.post('/chat', json=request(previous_response_id=first['response_id'], gaze_events=feedback(first['response_id']))).status_code == 409
    assert database.episodes.count_documents({}) == 0


def test_gaze_06_reward_uses_response_policy(api, model, database):
    first = api.post('/chat', json=request()).json()
    policy = database.policies.find_one()
    policy['_id'] = policy['policy_id'] = 'changed'
    policy['reward']['flag_scores']['confusion'] = -0.9
    database.policies.insert_one(policy)
    database.policy_state.update_one({}, {'$set': {'active_policy_id': 'changed'}})
    second = api.post('/chat', json=request(previous_response_id=first['response_id'], gaze_events=feedback(first['response_id'])))
    assert second.json()['reward'] == -0.5
    assert second.json()['policy_id'] == 'changed'


def test_env_04_run_07_failed_generation_has_no_effects(api, model, database, monkeypatch):
    first = api.post('/chat', json=request()).json()
    before = database.users.find_one()
    def fail(*args, **kwargs): raise llm.ModelError('provider quota exceeded')
    monkeypatch.setattr(llm, 'generate', fail)
    payload = request(previous_response_id=first['response_id'], gaze_events=feedback(first['response_id']))
    result = api.post('/chat', json=payload)
    assert result.status_code == 502
    assert database.users.find_one() == before
    assert database.episodes.count_documents({}) == database.memories.count_documents({}) == 0
    assert database.sessions.find_one()['turns'] == 1
    run = database.runs.find_one({'status': 'failed'})
    assert run['spans'][-1]['name'] == 'model.generate'
    assert run['spans'][-1]['status'] == 'failed'
    assert api.post('/chat', json=payload).status_code == 409


def test_run_06_atomic_commit_rollback(api, model, database, monkeypatch):
    first = api.post('/chat', json=request()).json()
    before = database.users.find_one()
    original = Collection.replace_one
    def fail_memory(self, *args, **kwargs):
        if self.name == 'memories': raise RuntimeError('injected memory write failure')
        return original(self, *args, **kwargs)
    monkeypatch.setattr(Collection, 'replace_one', fail_memory)
    result = api.post('/chat', json=request(previous_response_id=first['response_id'], gaze_events=feedback(first['response_id'])))
    assert result.status_code == 500
    assert database.users.find_one() == before
    assert database.episodes.count_documents({}) == 0
    assert database.sessions.find_one()['turns'] == 1


def test_run_05_concurrent_turns(database, monkeypatch):
    from db.sessions import start_session
    from db.users import get_user
    from db.policies import get_active_policy
    start_session('test_user', 'test_session'); get_user('test_user'); get_active_policy('test_user')
    barrier = Barrier(2)
    def generate(*args, **kwargs):
        barrier.wait(timeout=10)
        return ModelResult(text='Concurrent answer', provider='test-double', model='fixture',
                           temperature=0.0, max_output_tokens=2048, input_tokens=10, output_tokens=10)
    monkeypatch.setattr(llm, 'generate', generate)
    def run():
        try:
            ChatHarness().run(ChatRequest(**request()))
            return 'success'
        except Exception:
            return 'conflict'
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(run), pool.submit(run)]
        assert sorted(f.result() for f in futures) == ['conflict', 'success']
    assert database.sessions.find_one()['turns'] == 1
    assert database.users.find_one()['revision'] == 1
    assert database.runs.count_documents({'status': 'failed'}) == 1


def test_ctx_01_obs_02_server_owned_and_scoped(api, model):
    result = api.post('/chat', json=request()).json()
    assert api.post('/sessions', json={'user_id': 'test_user', 'session': {'messages': []}}).status_code == 405
    run_id = result['trace']['run_id']
    assert api.get(f'/inspect/runs/{run_id}?user_id=other').status_code == 404
    assert api.get('/inspect/runs?user_id=test_user&limit=101').status_code == 422
    trace = api.get(f'/inspect/runs/{run_id}?user_id=test_user').json()
    context = next(span for span in trace['spans'] if span['name'] == 'context.build')['output']
    assert context['query'] == 'Explain recursion'
    assert context['system_prompt'] == result['system_prompt']
    assert all(span['status'] == 'completed' for span in trace['spans'])
    assert trace['status'] == 'completed'
    assert api.delete('/sessions/test_session?user_id=other').status_code == 404
    assert api.delete('/sessions/test_session?user_id=test_user').status_code == 200


def test_health_during_model_call(api, database, monkeypatch):
    from threading import Event
    import time
    entered, release = Event(), Event()
    def waiting(*args, **kwargs):
        entered.set(); release.wait(timeout=3)
        raise llm.ModelError('test timeout')
    monkeypatch.setattr(llm, 'generate', waiting)
    with ThreadPoolExecutor() as pool:
        task = pool.submit(api.post, '/chat', json=request())
        assert entered.wait(timeout=2)
        started = time.perf_counter()
        assert api.get('/health').status_code == 200
        assert time.perf_counter() - started < 1
        release.set()
        assert task.result().status_code == 502
