from pydantic import BaseModel
from typing import Literal

class GazeEvent(BaseModel):
    zone:   str
    visits: int
    flag:   Literal['smooth', 'confusion', 'skipped', 'skim']

class ChatRequest(BaseModel):
    user_id:              str
    message:              str
    previous_response_id: str | None = None
    gaze_events:          list[GazeEvent] = []

class UserProfileOut(BaseModel):
    complexity_score:  int
    preferred_format:  str

class ChatResponse(BaseModel):
    response_id:  str
    text:         str
    reward:       float | None
    user_profile: UserProfileOut

class SessionEndRequest(BaseModel):
    user_id:    str
    session_id: str
