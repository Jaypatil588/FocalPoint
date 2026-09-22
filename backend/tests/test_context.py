import copy
import pytest
from models import MemoryReference, GazeEvent
from services.context_builder import build_context_packet, token_upper_bound
from services.policy_defaults import create_baseline_policy, now
from services.evaluation import deterministic_evaluation, replay, load_cases
from services.reward import compute_reward, update_profile_from_reward


def pair(index, size=100):
    return [{'role': role, 'text': '界' * size, 'message_id': f'{index}:{role}'} for role in ('user', 'assistant')]


def test_ctx_02_03_full_budget_unicode_pairs():
    policy = create_baseline_policy('test')
    policy.context.max_input_tokens = 2000
    policy.context.max_history_messages = 3
    messages = sum((pair(i) for i in range(20)), [])
    context = build_context_packet(messages, [], 'query', {'complexity_score': 5}, policy)
    assert len(context.history) == 2
    assert context.history[0].message_id == '19:user'
    assert context.omitted_messages == 38
    assert context.estimated_input_tokens == token_upper_bound(context.system_prompt, context.query, context.history)
    assert context.estimated_input_tokens <= 2000
    with pytest.raises(ValueError, match='mandatory'):
        build_context_packet(messages, [], '界' * 2000, {}, policy)


def test_ctx_04_memory_filter_and_provenance():
    memories = [MemoryReference(memory_id=str(i), key=str(i), content=content,
                               topic=topic, confidence=confidence, evidence_count=1,
                               episode_ids=['episode'], created_at=now(), updated_at=now())
                for i, (topic, confidence, content) in enumerate([
                    ('recursion', 0.8, 'Simplify recursion.'), ('volcanoes', 0.9, 'Explain volcanoes.'),
                    (None, 0.7, 'Prefer bullets.'), (None, 0.1, 'Uncertain preference.')])]
    result = build_context_packet([], memories, 'Explain recursion', {}, create_baseline_policy('test'))
    assert {memory.memory_id for memory in result.memories} == {'0', '2'}
    assert 'Uncertain' not in result.system_prompt
    assert 'volcanoes' not in result.system_prompt


@pytest.mark.parametrize('messages', [[{'role': 'assistant'}], [{'role': 'assistant'}, {'role': 'user'}]])
def test_ctx_06_bad_history(messages):
    with pytest.raises(ValueError):
        build_context_packet(messages, [], 'query', {}, create_baseline_policy('test'))


def test_eval_01_02_baseline_bad_policy_replay():
    policy = create_baseline_policy('test')
    assert deterministic_evaluation(policy)['passed']
    case = load_cases()[0]
    assert replay(case, policy) == replay(case, policy)
    broken = policy.model_copy(deep=True)
    broken.reward.flag_scores['confusion'] = 1
    assert not deterministic_evaluation(broken)['passed']
    no_memory = policy.model_copy(deep=True)
    no_memory.context.max_memories = 0
    assert not deterministic_evaluation(no_memory)['passed']


def test_gaze_07_no_mutation_empty_and_bounds():
    policy = create_baseline_policy('test')
    profile = {'complexity_score': 1, 'topics_to_simplify': ['existing']}
    before = copy.deepcopy(profile)
    events = [GazeEvent(zone='a:1', visits=4, flag='confusion')]
    assert compute_reward([], policy) is None
    assert compute_reward(events, policy) == -0.5
    assert update_profile_from_reward(profile, -0.5, events, policy, 'recursion')['complexity_score'] == 1
    assert profile == before
