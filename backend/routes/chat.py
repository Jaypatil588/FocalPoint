from fastapi import APIRouter
from models import ChatRequest, ChatResponse
from services.chat_harness import ChatHarness

router = APIRouter()


@router.post("/chat", response_model=ChatResponse)
def chat(request: ChatRequest):
    return ChatHarness().run(request)
