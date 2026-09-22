from models import AdaptationPolicy, GazeEvent

_STOP = {
    'the','a','an','is','it','in','on','at','to','for','of','and','or','but',
    'what','how','why','when','where','who','which','this','that','these','those',
    'i','me','my','you','your','we','our','they','their','do','does','did',
    'can','could','would','should','will','may','might','with','from','about',
    'be','been','have','has','had','not','if','as','so','no','yes','tell','give',
    'make','show','explain','please','help','just','also','more','some','any',
}

def _extract_topic(message: str) -> str | None:
    for word in message.lower().split():
        clean = ''.join(c for c in word if c.isalpha())
        if len(clean) > 4 and clean not in _STOP:
            return clean
    return None

def extract_topic(message: str) -> str | None:
    return _extract_topic(message)


def compute_reward(
    gaze_events: list[GazeEvent], policy: AdaptationPolicy
) -> float | None:
    if not gaze_events:
        return None

    total = sum(policy.reward.flag_scores[e.flag] for e in gaze_events)
    reward = total / len(gaze_events)
    return round(max(-1.0, min(1.0, reward)), 2)

def update_profile_from_reward(
    profile: dict,
    reward: float,
    gaze_events: list[GazeEvent],
    policy: AdaptationPolicy,
    message: str = "",
) -> dict:
    updates = {}
    score = profile.get("complexity_score", 5)

    if reward < 0:
        updates["complexity_score"] = max(
            1, score + policy.profile_update.negative_complexity_delta
        )
        updates["preferred_format"] = "bullets"
        # Surface the topic that caused confusion so the prompt can address it
        if message:
            topic = _extract_topic(message)
            if topic:
                existing = profile.get("topics_to_simplify", [])
                if topic not in existing:
                    limit = policy.profile_update.max_topics_to_simplify
                    updates["topics_to_simplify"] = (existing + [topic])[-limit:]
    elif reward > 0:
        updates["complexity_score"] = min(
            10, score + policy.profile_update.positive_complexity_delta
        )
        if score >= 6:
            updates["preferred_format"] = "prose"

    confusion_zones = [e.zone for e in gaze_events if e.flag == "confusion"]
    if confusion_zones:
        updates["re_read_rate"] = round(len(confusion_zones) / len(gaze_events), 2)

    # Estimate words read from paragraph-level zones that were not skipped
    read_zones = {
        e.zone for e in gaze_events
        if e.flag in ("smooth", "confusion", "skim") and "_w" not in e.zone
    }
    if read_zones:
        estimated = len(read_zones) * 30  # ~30 words per paragraph zone
        current   = profile.get("avg_words_read", 200)
        alpha = policy.profile_update.reading_length_ema_alpha
        updates["avg_words_read"] = round(current * (1 - alpha) + estimated * alpha)

    return updates
