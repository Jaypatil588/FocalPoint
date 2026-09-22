from datetime import datetime, timezone
from models import AdaptationPolicy


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def create_baseline_policy(user_id: str) -> AdaptationPolicy:
    return AdaptationPolicy.model_validate({
        "policy_id": f"{user_id}:baseline-v1", "user_id": user_id,
        "parent_policy_id": None, "created_at": now(), "created_by": "system",
        "rationale": "Versioned initial gaze-adaptation behavior.",
        "prompt": {"base_instructions": [
            "You are a helpful, knowledgeable AI assistant.",
            "Adapt explanation style to reading preferences without sacrificing correctness.",
            "Be direct and complete. Answer the question fully.",
            "Match response length to the question."
        ]},
        "reward": {"flag_scores": {"smooth": 1.0, "skim": -0.3, "confusion": -0.5, "skipped": -0.2}},
        "profile_update": {"positive_complexity_delta": 1, "negative_complexity_delta": -1,
                           "max_topics_to_simplify": 5, "reading_length_ema_alpha": 0.3},
        "context": {"max_history_messages": 12, "max_memories": 5, "max_input_tokens": 8000},
    })
