import httpx
import pytest
from services import llm
from models import Judgement


@pytest.mark.parametrize('variable', ['MODEL_PROVIDER', 'GROQ_MODEL', 'GROQ_API_KEY'])
def test_env_02_missing_config(monkeypatch, variable):
    monkeypatch.setenv('MODEL_PROVIDER', 'groq')
    monkeypatch.setenv('GROQ_MODEL', 'configured-model')
    monkeypatch.setenv('GROQ_API_KEY', 'test-secret')
    monkeypatch.delenv(variable, raising=False)
    with pytest.raises(llm.ModelError, match=variable): llm.generate('system', 'query')


@pytest.mark.parametrize('scenario', ['quota', 'auth', 'timeout', 'empty', 'truncated', 'bad_json', 'bad_shape'])
def test_env_04_provider_failures(monkeypatch, scenario):
    monkeypatch.setenv('GROQ_REQUEST_INTERVAL_SECONDS', '0')
    monkeypatch.setenv('MODEL_PROVIDER', 'groq'); monkeypatch.setenv('GROQ_MODEL', 'fixture'); monkeypatch.setenv('GROQ_API_KEY', 'test-secret')
    calls = []
    def post(self, url, **kwargs):
        calls.append(kwargs)
        if scenario == 'timeout': raise httpx.ReadTimeout('timeout')
        if scenario == 'quota': return httpx.Response(429, text='quota test-secret')
        if scenario == 'auth': return httpx.Response(401, text='invalid test-secret')
        data = {'model': 'fixture', 'choices': [{'message': {'content': '' if scenario == 'empty' else '{bad' if scenario == 'bad_json' else '{}'},
                                               'finish_reason': 'length' if scenario == 'truncated' else 'stop'}],
                'usage': {'prompt_tokens': 10, 'completion_tokens': 10}}
        return httpx.Response(200, json=data)
    monkeypatch.setattr(httpx.Client, 'post', post)
    with pytest.raises(llm.ModelError) as error:
        if scenario in {'bad_json', 'bad_shape'}: llm.structured('system', 'query', Judgement)
        else: llm.generate('system', 'query')
    assert 'test-secret' not in str(error.value)
    assert len(calls) == 1
