from models import GazeEvent

FLAG_SCORES = {
    "smooth":    1.0,
    "skim":     -0.3,
    "confusion": -0.5,
    "skipped":  -0.2,
}

def compute_reward(gaze_events: list[GazeEvent]) -> float | None:
    if not gaze_events:
        return None

    total = sum(FLAG_SCORES.get(e.flag, 0) for e in gaze_events)
    reward = total / len(gaze_events)
    return round(max(-1.0, min(1.0, reward)), 2)

def update_profile_from_reward(profile: dict, reward: float, gaze_events: list[GazeEvent]) -> dict:
    updates = {}
    score   = profile.get("complexity_score", 5)

    if reward < -0.3:
        updates["complexity_score"]  = max(1, score - 1)
        updates["preferred_format"]  = "bullets"
    elif reward >= 0.7:
        updates["complexity_score"]  = min(10, score + 1)

    confusion_zones = [e.zone for e in gaze_events if e.flag == "confusion"]
    if confusion_zones:
        updates["re_read_rate"] = round(
            len(confusion_zones) / len(gaze_events), 2
        )

    return updates
