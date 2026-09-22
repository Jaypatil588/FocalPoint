from models import AdaptationPolicy
from services.policy_defaults import create_baseline_policy
from .mongo import get_db


def get_active_policy(user_id: str) -> AdaptationPolicy:
    db = get_db()
    baseline = create_baseline_policy(user_id)
    db.policies.update_one({"_id": baseline.policy_id},
                           {"$setOnInsert": baseline.model_dump()}, upsert=True)
    db.policy_state.update_one({"_id": user_id},
                              {"$setOnInsert": {"active_policy_id": baseline.policy_id}}, upsert=True)
    return get_policy(user_id, db.policy_state.find_one({"_id": user_id})["active_policy_id"])


def get_policy(user_id: str, policy_id: str) -> AdaptationPolicy:
    document = get_db().policies.find_one({"_id": policy_id, "user_id": user_id}, {"_id": 0})
    if document is None:
        raise KeyError("policy not found")
    return AdaptationPolicy.model_validate(document)


def insert_candidate(policy: AdaptationPolicy):
    get_db().policies.insert_one({"_id": policy.policy_id, **policy.model_dump()})
