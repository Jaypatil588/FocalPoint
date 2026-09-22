import uuid
import pytest
from pymongo.collection import Collection
from conftest import request
from test_chat import feedback
from models import PolicyProposal, Judgement, ModelResult
from services import llm
from services.evaluation import promotion_gate
from services.policy_defaults import create_baseline_policy


def scores(correctness=8, clarity=8, adaptation=8):
    return dict(correctness=correctness, clarity=clarity, adaptation=adaptation)


@pytest.mark.parametrize('baseline,candidate,expected', [
    (scores(), scores(), False),
    (scores(), scores(8, 8.3, 8.3), True),
    (scores(), scores(8, 8.2, 8.2), False),
    (scores(9, 6, 6), scores(8, 10, 10), False),
    (scores(5, 5, 5), scores(6, 10, 10), False),
    (scores(7, 0, 0), scores(7, 1, 1), False),
])
def test_eval_05_gate_boundaries(baseline, candidate, expected):
    gate = promotion_gate({'passed': True}, [{'case_id': 'case', 'baseline_grades': baseline, 'candidate_grades': candidate}])
    assert gate['passed'] is expected


@pytest.fixture
def seed(api, model):
    first = api.post('/chat', json=request()).json()
    response = api.post('/chat', json=request(previous_response_id=first['response_id'], gaze_events=feedback(first['response_id'])))
    assert response.status_code == 200
    return response.json()


@pytest.fixture
def grading(monkeypatch):
    counts = {'proposals': 0, 'judges': 0}
    def structured(system, query, schema):
        if schema is PolicyProposal:
            counts['proposals'] += 1
            base = create_baseline_policy('test_user')
            parsed = PolicyProposal(rationale='Repeated confusion supports concrete worked examples.',
                                    adaptive_instructions=[f'Use one short worked example when helpful. Revision {counts["proposals"]}.'],
                                    reward=base.reward, profile_update=base.profile_update, context=base.context)
        else:
            assert schema is Judgement
            # Explicit test-double ordering; verifies wiring, not model quality.
            odd = counts['judges'] % 2 == 1
            counts['judges'] += 1
            parsed = Judgement(response_a=scores(9, 9, 9) if odd else scores(),
                               response_b=scores() if odd else scores(9, 9, 9), reason='fixture comparison')
        result = ModelResult(text=parsed.model_dump_json(), provider='test-double', model='fixture',
                             temperature=0.0, max_output_tokens=2048, input_tokens=10, output_tokens=10)
        return parsed, result
    monkeypatch.setattr(llm, 'structured', structured)
    return counts


def improve(api):
    return api.post('/session/end', json={'user_id': 'test_user', 'session_id': 'test_session', 'request_id': uuid.uuid4().hex})


def test_rsi_01_insufficient_evidence(api, model, database):
    api.post('/chat', json=request())
    result = improve(api)
    assert result.status_code == 409
    assert database.policies.count_documents({}) == 1


def test_eval_03_04_rsi_02_04_07_full_pipeline(seed, grading, api, database, model):
    original = database.policies.find_one()
    first = improve(api)
    assert first.status_code == 200, first.text
    assert first.json()['promoted'] is True
    assert grading['judges'] == 8
    evaluation = database.evaluations.find_one()
    assert len(evaluation['cases']) == 4
    assert len(evaluation['cases'][0]['judges']) == 2
    cache_calls = [call for call in model if 'cache TTL I mentioned' in call[1]]
    assert len(cache_calls) == 2
    assert all('30 seconds' in call[2][0]['content'] for call in cache_calls)
    assert evaluation['dataset_hash']
    for run in database.runs.find({'run_type': 'improvement'}):
        for stage in run['spans']:
            if stage['name'].endswith('.judge'):
                assert 'policy_id' not in stage['input'] and 'rationale' not in stage['input']
    second = improve(api)
    assert second.status_code == 200, second.text
    assert second.json()['promoted']
    candidate = database.policies.find_one({'policy_id': second.json()['candidate_policy_id']})
    assert candidate['parent_policy_id'] == first.json()['candidate_policy_id']
    assert database.policies.find_one({'_id': original['_id']}) == original


def test_rsi_04_rejection_keeps_active(seed, grading, api, database, monkeypatch):
    from services import improvement
    original = improvement.run_evaluation
    def rejected(*args):
        result = original(*args)
        result['gate'] = {'passed': False, 'reasons': ['fixture regression'], 'gain': -1}
        database.evaluations.update_one({'_id': result['evaluation_id']}, {'$set': {'gate': result['gate']}})
        return result
    monkeypatch.setattr(improvement, 'run_evaluation', rejected)
    before = database.policy_state.find_one()
    response = improve(api)
    assert response.status_code == 200
    assert response.json()['promoted'] is False
    assert database.policy_state.find_one() == before


def test_rsi_05_stale_promotion(seed, grading, api, database, monkeypatch):
    from services import improvement
    original = improvement.run_evaluation
    def stale(*args):
        result = original(*args)
        database.policy_state.update_one({}, {'$set': {'active_policy_id': 'concurrent-policy'}})
        return result
    monkeypatch.setattr(improvement, 'run_evaluation', stale)
    result = improve(api)
    assert result.status_code == 409
    assert database.policy_state.find_one()['active_policy_id'] == 'concurrent-policy'


def test_rsi_06_promotion_transaction_failure(seed, grading, api, database, monkeypatch):
    original = Collection.update_one
    def fail_completion(self, selector, update, *args, **kwargs):
        if self.name == 'runs' and update.get('$set', {}).get('status') == 'completed':
            raise RuntimeError('injected run completion failure')
        return original(self, selector, update, *args, **kwargs)
    monkeypatch.setattr(Collection, 'update_one', fail_completion)
    before = database.policy_state.find_one()
    response = improve(api)
    assert response.status_code == 500
    assert database.policy_state.find_one() == before


@pytest.mark.parametrize('field,value', [('user_id', 'another-user'),
                                         ('baseline_policy_id', 'another-parent'),
                                         ('candidate_policy_id', 'another-candidate')])
def test_rsi_05_mismatched_evaluation(seed, grading, api, database, monkeypatch, field, value):
    from services import improvement
    original = improvement.run_evaluation
    def mismatched(*args):
        result = original(*args)
        database.evaluations.update_one({'_id': result['evaluation_id']}, {'$set': {field: value}})
        return result
    monkeypatch.setattr(improvement, 'run_evaluation', mismatched)
    before = database.policy_state.find_one()
    response = improve(api)
    assert response.status_code == 409
    assert 'matching passing evaluation' in response.text
    assert database.policy_state.find_one() == before


def test_rsi_final_feedback_and_request_replay(api, model, grading, database):
    first = api.post('/chat', json=request()).json()
    initial_revision = database.users.find_one()['revision']
    payload = {'user_id': 'test_user', 'session_id': 'test_session', 'request_id': uuid.uuid4().hex,
               'previous_response_id': first['response_id'], 'gaze_events': feedback(first['response_id'])}
    response = api.post('/session/end', json=payload)
    assert response.status_code == 200, response.text
    assert response.json()['promoted']
    assert database.episodes.count_documents({}) == 1
    assert database.users.find_one()['revision'] == initial_revision + 1
    assert database.sessions.find_one()['revision'] == 2
    repeated = api.post('/session/end', json=payload)
    assert repeated.json() == response.json()
    assert grading['proposals'] == 1 and grading['judges'] == 8
    assert database.episodes.count_documents({}) == 1


def test_eval_06_judge_failure(seed, grading, api, database, monkeypatch):
    original = llm.structured
    def fail(system, query, schema):
        if schema is Judgement: raise llm.ModelError('malformed grade')
        return original(system, query, schema)
    monkeypatch.setattr(llm, 'structured', fail)
    before = database.policy_state.find_one()
    assert improve(api).status_code == 502
    assert database.evaluations.find_one()['status'] == 'failed'
    assert database.policy_state.find_one() == before


def test_rsi_03_noop_and_extra_fields(seed, grading, api, database, monkeypatch):
    from services.meta_agent import propose_candidate_policy
    from db.policies import get_active_policy
    from db.episodes import get_session_episodes
    from services.tracing import RunTrace
    from models import SessionEndRequest
    baseline = get_active_policy('test_user')
    baseline.prompt.adaptive_instructions = ['Already present.']
    def same(system, query, schema):
        proposal = PolicyProposal(rationale='This deliberately proposes identical behavior.', adaptive_instructions=['Already present.'],
                                  reward=baseline.reward, profile_update=baseline.profile_update, context=baseline.context)
        return proposal, ModelResult(text='{}', provider='test-double', model='fixture', temperature=0,
                                     max_output_tokens=100, input_tokens=10, output_tokens=10)
    monkeypatch.setattr(llm, 'structured', same)
    trace = RunTrace('improvement', SessionEndRequest(user_id='test_user', session_id='test_session', request_id=uuid.uuid4().hex))
    with pytest.raises(ValueError, match='does not change'):
        propose_candidate_policy(baseline, get_session_episodes('test_user', 'test_session'), trace)
    valid = PolicyProposal(rationale='An otherwise valid proposed policy change.', adaptive_instructions=['Use a short example.'],
                           reward=baseline.reward, profile_update=baseline.profile_update, context=baseline.context).model_dump()
    with pytest.raises(ValueError, match='Extra inputs'):
        PolicyProposal.model_validate({**valid, 'evaluation_threshold': 0})


@pytest.mark.parametrize('grade', [float('nan'), float('inf'), True, -1, 11, '9'])
def test_eval_06_invalid_grade_schema(grade):
    with pytest.raises(ValueError):
        Judgement(response_a=scores(grade), response_b=scores(), reason='invalid')
