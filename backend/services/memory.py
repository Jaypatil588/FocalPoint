from models import MemoryReference
from services.policy_defaults import now
from services.reward import extract_topic
from services.tracing import digest


def derive_memories(user_id, episode, existing):
    by_key = {memory.key: memory.model_copy(deep=True) for memory in existing}
    updates = {}
    reward = episode["reward"]
    topic = extract_topic(episode["user_message"])
    if reward < 0 and topic and any(event["flag"] == "confusion" for event in episode["gaze_events"]):
        updates[f"topic:{topic}"] = (f"Use simpler explanations and concrete examples for {topic}.", topic)
    if abs(reward) >= 0.5:
        updates["preferred_format"] = (f"Prefer {episode['profile_after']['preferred_format']} formatting.", None)
    changed = []
    for key, (content, topic) in updates.items():
        previous = by_key.get(key)
        evidence = [] if previous is None else list(previous.episode_ids)
        if episode["episode_id"] in evidence:
            continue
        evidence.append(episode["episode_id"])
        memory = MemoryReference(
            memory_id=digest([user_id, key]), key=key, content=content,
            confidence=round(min(0.95, abs(reward) * 0.5 + min(len(evidence), 5) * 0.1), 3),
            evidence_count=len(evidence), episode_ids=evidence, topic=topic,
            created_at=now() if previous is None else previous.created_at, updated_at=now(),
        )
        by_key[key] = memory
        changed.append(memory)
    return list(by_key.values()), changed
