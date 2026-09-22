"""Real provider + real MongoDB acceptance run; no mocks or substituted output."""
import json
import sys
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
from fastapi.testclient import TestClient
from main import app
from db.mongo import get_db


def main():
    user = "live_" + uuid.uuid4().hex[:12]
    session = uuid.uuid4().hex
    report = {"user_id": user, "session_id": session, "steps": []}
    with TestClient(app) as client:
        def post(path, payload):
            result = client.post(path, json={"user_id": user, "session_id": session,
                                            "request_id": uuid.uuid4().hex, **payload})
            if result.status_code != 200:
                raise RuntimeError(f"{path}: HTTP {result.status_code}: {result.text}")
            return result.json()
        first = post('/chat', {"message": "Explain recursion in two short paragraphs."})
        assert first['text'] and first['reward'] is None
        report['steps'].append({'chat_1': first['trace']['run_id']})
        second = post('/chat', {"message": "Show a small example of recursion with a base case.",
                               "previous_response_id": first['response_id'],
                               "gaze_events": [{"zone": first['response_id'] + ':line_0', "flag": "confusion", "visits": 4}]})
        assert second['reward'] < 0 and second['user_profile']['complexity_score'] == 4
        trace = client.get(f"/inspect/runs/{second['trace']['run_id']}?user_id={user}").json()
        context = next(stage['output'] for stage in trace['spans'] if stage['name'] == 'context.build')
        assert len(context['history']) == 2
        assert context['estimated_input_tokens'] <= context['token_budget']
        model = next(stage['output'] for stage in trace['spans'] if stage['name'] == 'model.generate')
        assert model['provider'] == 'groq' and model['input_tokens'] > 0
        report['provider'] = model['provider']; report['model'] = model['model']
        report['steps'].append({'chat_2': second['trace']['run_id'], 'context_history_messages': 2})
        improvement = post('/session/end', {
            'previous_response_id': second['response_id'],
            'gaze_events': [{'zone': second['response_id'] + ':line_0', 'flag': 'confusion', 'visits': 4}],
        })
        evaluation = client.get(f"/inspect/evaluations/{improvement['evaluation_id']}?user_id={user}").json()
        assert evaluation['status'] == 'completed'
        assert len(evaluation['cases']) == 4
        assert improvement['promoted'] == evaluation['gate']['passed']
        policies = client.get(f'/inspect/policies?user_id={user}').json()
        assert policies['active_policy_id'] == improvement['active_policy_id']
        memory = client.get(f'/inspect/memory?user_id={user}&session_id={session}').json()
        assert len(memory['working']) == 4 and len(memory['episodic']) == 2 and memory['semantic']
        report['steps'].append({'improvement': improvement})
        report['dataset_hash'] = evaluation['dataset_hash']
        # Reconnect through a new Mongo client, proving committed persistence beyond client lifetime.
        from pymongo import MongoClient
        import os
        with MongoClient(os.environ['MONGODB_URI']) as fresh:
            stored = fresh[get_db().name].sessions.find_one({'_id': session})
            assert len(stored['messages']) == 4
        report['persistence_reconnect'] = 'passed'
        report['status'] = 'passed'
    artifact = ROOT / '.runtime' / 'live-acceptance.json'
    artifact.parent.mkdir(exist_ok=True)
    artifact.write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
