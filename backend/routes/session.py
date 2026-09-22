from fastapi import APIRouter, HTTPException
from models import SaveProfileRequest, SessionEndRequest
from db.mongo import get_db
from db.users import get_user
from services.improvement import ImprovementService

router = APIRouter()


@router.get("/profile")
def profile(user_id: str):
    user = get_user(user_id)
    return {key: user[key] for key in ("complexity_score", "preferred_format")}


@router.post("/profile")
def save_profile(request: SaveProfileRequest):
    get_user(request.user_id)
    get_db().users.update_one({"_id": request.user_id}, {"$set": request.profile.model_dump(), "$inc": {"revision": 1}})
    return request.profile


@router.get("/sessions")
def sessions(user_id: str):
    return list(get_db().sessions.find({"user_id": user_id}, {"_id": 0}).sort("updated_at", -1).limit(20))


@router.delete("/sessions/{session_id}")
def delete_session(session_id: str, user_id: str):
    result = get_db().sessions.delete_one({"_id": session_id, "user_id": user_id})
    if result.deleted_count != 1:
        raise HTTPException(404, "session not found")
    return {"id": session_id, "deleted": True}


@router.post("/session/end")
def improve(request: SessionEndRequest):
    return ImprovementService().run(request)
