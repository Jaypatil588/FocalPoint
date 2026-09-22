from .mongo import get_db

DEFAULT_PROFILE = {
    "complexity_score": 5, "preferred_format": "prose", "avg_words_read": 200,
    "reads_to_end": True, "re_read_rate": 0.0, "topics_to_simplify": [],
    "topics_comfortable": [], "prospective_flags": [], "sessions_seen": 0,
}


def get_user(user_id):
    db = get_db()
    db.users.update_one({"_id": user_id}, {"$setOnInsert": {**DEFAULT_PROFILE, "revision": 0}}, upsert=True)
    # Explicit schema migration for profiles saved before revision tracking.
    db.users.update_one({"_id": user_id, "revision": {"$exists": False}}, {"$set": {"revision": 0}})
    return db.users.find_one({"_id": user_id})
