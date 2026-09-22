import copy
import uuid
from db.mongo import get_db
from db.users import get_user
from db.sessions import start_session, get_response_feedback_context
from db.policies import get_active_policy, get_policy
from db.memories import get_semantic_memories
from services import llm
from services.context_builder import build_context_packet
from services.memory import derive_memories
from services.policy_defaults import now
from services.reward import compute_reward, update_profile_from_reward
from services.tracing import RunTrace, ConflictError, digest


def prepare_feedback(request, session, profile, memories):
    staged_profile = copy.deepcopy(profile)
    if not request.gaze_events:
        return staged_profile, memories, [], None
    original_query, response = get_response_feedback_context(session, request.previous_response_id)
    events = [event.model_dump() for event in request.gaze_events]
    feedback_hash = digest(sorted(events, key=lambda item: item["zone"]))
    episode_id = f"{request.user_id}:{request.previous_response_id}"
    existing = get_db().episodes.find_one({"_id": episode_id})
    if existing is not None:
        if existing["feedback_hash"] != feedback_hash:
            raise ConflictError("this response already has different feedback")
        return staged_profile, memories, [], None
    policy = get_policy(request.user_id, response["policy_id"])
    reward = compute_reward(request.gaze_events, policy)
    updates = update_profile_from_reward(profile, reward, request.gaze_events, policy, original_query["text"])
    staged_profile.update(updates)
    episode = {
        "_id": episode_id, "episode_id": episode_id, "user_id": request.user_id,
        "session_id": request.session_id, "response_id": request.previous_response_id,
        "user_message": original_query["text"], "assistant_response": response["text"],
        "gaze_events": events, "feedback_hash": feedback_hash, "reward": reward,
        "profile_before": {k: v for k, v in profile.items() if k != "_id"},
        "profile_after": {k: v for k, v in staged_profile.items() if k != "_id"},
        "policy_id": policy.policy_id, "trace_id": response["trace_id"], "timestamp": now(),
    }
    all_memories, changed = derive_memories(request.user_id, episode, memories)
    return staged_profile, all_memories, changed, episode


def commit_feedback(db, request, profile, staged_profile, changed_memories, episode, transaction):
    updates = {key: value for key, value in staged_profile.items() if key not in {"_id", "revision"}}
    updated = db.users.update_one({"_id": request.user_id, "revision": profile["revision"]},
                                 {"$set": updates, "$inc": {"revision": 1}}, session=transaction)
    if updated.modified_count != 1:
        raise ConflictError("profile changed during this run; retry explicitly")
    if episode is not None:
        db.episodes.insert_one(episode.copy(), session=transaction)
    for memory in changed_memories:
        db.memories.replace_one({"_id": memory.memory_id}, {"_id": memory.memory_id,
                                "user_id": request.user_id, **memory.model_dump()}, upsert=True, session=transaction)


class ChatHarness:
    def run(self, request):
        trace = RunTrace("chat", request)
        if trace.cached is not None:
            return trace.cached
        db = get_db()
        try:
            with trace.span("snapshot.load") as span:
                policy = get_active_policy(request.user_id)
                session = start_session(request.user_id, request.session_id)
                profile = get_user(request.user_id)
                memories = get_semantic_memories(request.user_id)
                span["output"] = {"policy_id": policy.policy_id, "profile_revision": profile["revision"],
                                  "session_revision": session["revision"]}
            with trace.span("feedback.prepare") as span:
                staged_profile, memories, changed_memories, episode = prepare_feedback(request, session, profile, memories)
                span["output"] = {"episode_id": None if episode is None else episode["episode_id"],
                                  "profile_after": {k: v for k, v in staged_profile.items() if k != "_id"}}
            with trace.span("context.build") as span:
                context = build_context_packet(session["messages"], memories, request.message, staged_profile, policy)
                span["output"] = context.model_dump()
            with trace.span("model.generate") as span:
                result = llm.generate(context.system_prompt, request.message,
                                      [item.model_dump() for item in context.history])
                span["output"] = result.model_dump()
            response_id = uuid.uuid4().hex
            response = {
                "response_id": response_id, "text": result.text,
                "reward": None if episode is None else episode["reward"],
                "user_profile": {key: staged_profile[key] for key in ("complexity_score", "preferred_format")},
                "system_prompt": context.system_prompt, "policy_id": policy.policy_id,
                "trace": trace.summary(),
            }
            with trace.span("commit"):
                with db.client.start_session() as transaction:
                    with transaction.start_transaction():
                        commit_feedback(db, request, profile, staged_profile, changed_memories, episode, transaction)
                        messages = [
                            {"role": "user", "text": request.message, "message_id": uuid.uuid4().hex},
                            {"role": "assistant", "text": result.text, "message_id": uuid.uuid4().hex,
                             "responseId": response_id, "policy_id": policy.policy_id,
                             "trace_id": trace.document["trace_id"], "system_prompt": context.system_prompt},
                        ]
                        updated = db.sessions.update_one({"_id": request.session_id, "user_id": request.user_id,
                                                          "revision": session["revision"]}, {
                            "$push": {"messages": {"$each": messages}}, "$inc": {"revision": 1, "turns": 1},
                            "$set": {"updated_at": now(), "title": request.message[:40] if not session["messages"] else session["title"]},
                        }, session=transaction)
                        if updated.modified_count != 1:
                            raise ConflictError("session changed during this run; retry explicitly")
                        trace.complete(response, transaction)
                trace.finished = True
            return response
        except Exception as error:
            trace.fail(error)
            raise
