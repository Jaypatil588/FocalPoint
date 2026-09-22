import os
from pymongo import MongoClient

_client: MongoClient | None = None

def get_db():
    global _client
    if _client is None:
        uri = os.getenv("MONGODB_URI")
        if not uri:
            raise RuntimeError("MONGODB_URI must be set")
        _client = MongoClient(uri, serverSelectionTimeoutMS=5000, connectTimeoutMS=5000,
                              socketTimeoutMS=15000, retryWrites=False, retryReads=False)
    return _client[os.getenv("MONGODB_DB_NAME", "focalpoint")]
