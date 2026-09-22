import json
import logging
import pytest
from conftest import request
from models import ChatRequest
from services.tracing import RunTrace


def test_obs_03_structured_logs(api, model, caplog):
    logger = logging.getLogger('focalpoint.runs')
    logger.addHandler(caplog.handler)
    try:
        result = api.post('/chat', json=request())
    finally:
        logger.removeHandler(caplog.handler)
    assert result.status_code == 200
    events = [json.loads(record.message) for record in caplog.records if record.name == 'focalpoint.runs']
    assert events
    assert all(event['run_id'] == result.json()['trace']['run_id'] for event in events)
    assert all(event['status'] == 'completed' and event['duration_ms'] >= 0 for event in events)
    assert all(set(event) == {'run_id', 'stage', 'status', 'duration_ms'} for event in events)


def test_run_stage_budget(database):
    trace = RunTrace('chat', ChatRequest.model_validate(request()))
    for index in range(64):
        with trace.span(f'test.{index}'):
            pass
    with pytest.raises(RuntimeError, match='64-stage budget') as error:
        with trace.span('overflow'):
            pytest.fail('stage beyond budget must not execute')
    trace.fail(error.value)
    stored = database.runs.find_one({'_id': trace.run_id})
    assert stored['status'] == 'failed'
    assert len(stored['spans']) == 64
