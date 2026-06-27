import os
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '../../.env'))

_client: MongoClient | None = None

def get_db():
    global _client
    if _client is None:
        uri = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
        _client = MongoClient(uri)
    return _client[os.getenv("MONGODB_DB_NAME", "focalpoint")]
