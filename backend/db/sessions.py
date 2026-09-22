from .mongo import get_db
from services.policy_defaults import now


def start_session(user_id, session_id):
    db = get_db()
    existing = db.sessions.find_one({"_id": session_id})
    if existing is not None and existing["user_id"] != user_id:
        raise KeyError("session not found")
    db.sessions.update_one({"_id": session_id, "user_id": user_id}, {"$setOnInsert": {
        "id": session_id, "user_id": user_id, "created_at": now(), "updated_at": now(),
        "messages": [], "revision": 0, "turns": 0, "title": "New chat",
    }}, upsert=True)
    db.sessions.update_one({"_id": session_id, "revision": {"$exists": False}}, {"$set": {"revision": 0}})
    return get_session(user_id, session_id)


def get_session(user_id, session_id):
    document = get_db().sessions.find_one({"_id": session_id, "user_id": user_id})
    if document is None:
        raise KeyError("session not found")
    return document


def get_response_feedback_context(session, response_id):
    messages = session["messages"]
    for index, message in enumerate(messages):
        if message.get("responseId") == response_id:
            if message["role"] != "assistant" or index == 0 or messages[index - 1]["role"] != "user":
                raise ValueError("invalid stored conversation ordering")
            if "policy_id" not in message:
                raise ValueError("response predates policy provenance; start a new chat")
            return messages[index - 1], message
    raise KeyError("response not found in this session")
