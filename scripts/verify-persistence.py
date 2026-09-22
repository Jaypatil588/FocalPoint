"""Capture live API records, then compare them after restarting the backend."""
import argparse
import json
from pathlib import Path
from urllib.parse import quote
import httpx

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('mode', choices=['capture', 'verify'])
args = parser.parse_args()
report = json.loads((ROOT / '.runtime/live-acceptance.json').read_text())
user = quote(report['user_id'])
improvement = report['steps'][2]['improvement']
paths = {
    'sessions': f'/sessions?user_id={user}',
    'memory': f'/inspect/memory?user_id={user}&session_id={report["session_id"]}',
    'policies': f'/inspect/policies?user_id={user}',
    'evaluation': f'/inspect/evaluations/{improvement["evaluation_id"]}?user_id={user}',
    'chat_run': f'/inspect/runs/{quote(report["steps"][1]["chat_2"])}?user_id={user}',
    'improvement_run': f'/inspect/runs/{quote(improvement["trace"]["run_id"])}?user_id={user}',
}
with httpx.Client(base_url='http://127.0.0.1:8000', timeout=15) as client:
    records = {}
    for name, path in paths.items():
        response = client.get(path)
        response.raise_for_status()
        records[name] = response.json()
artifact = ROOT / '.runtime/persistence-before-restart.json'
if args.mode == 'capture':
    artifact.write_text(json.dumps(records, indent=2))
    print('Captured six live API records; restart the backend before verifying.')
else:
    expected = json.loads(artifact.read_text())
    assert records == expected, 'Persisted API state changed across restart'
    assert len(records['memory']['working']) == 4
    assert len(records['memory']['episodic']) == 2
    assert records['memory']['semantic']
    assert records['evaluation']['status'] == 'completed'
    assert records['chat_run']['status'] == records['improvement_run']['status'] == 'completed'
    result = {'status': 'passed', 'unchanged_records': list(paths), 'session_id': report['session_id']}
    (ROOT / '.runtime/persistence-verification.json').write_text(json.dumps(result, indent=2))
    print(json.dumps(result, indent=2))
