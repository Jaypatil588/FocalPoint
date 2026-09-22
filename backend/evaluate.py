"""Offline deterministic regression CLI. Never calls a provider or database."""
import argparse
import json
from pathlib import Path
from models import AdaptationPolicy
from services.evaluation import deterministic_evaluation
from services.policy_defaults import create_baseline_policy

parser = argparse.ArgumentParser()
source = parser.add_mutually_exclusive_group(required=True)
source.add_argument('--baseline', action='store_true')
source.add_argument('--policy-file', type=Path)
args = parser.parse_args()
policy = create_baseline_policy('offline') if args.baseline else AdaptationPolicy.model_validate_json(args.policy_file.read_text())
result = deterministic_evaluation(policy)
print(json.dumps(result, indent=2))
raise SystemExit(0 if result['passed'] else 1)
