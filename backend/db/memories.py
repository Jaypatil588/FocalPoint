from models import MemoryReference
from .mongo import get_db


def get_semantic_memories(user_id):
    documents = get_db().memories.find({"user_id": user_id}, {"_id": 0, "user_id": 0}).sort("updated_at", -1).limit(100)
    return [MemoryReference.model_validate(document) for document in documents]
