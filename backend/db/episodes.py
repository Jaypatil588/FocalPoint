from .mongo import get_db


def get_session_episodes(user_id, session_id):
    return list(get_db().episodes.find({"user_id": user_id, "session_id": session_id},
                                      {"_id": 0}).sort("timestamp", 1))
