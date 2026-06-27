from fastapi import APIRouter
from models import SessionEndRequest
from db.users import get_user
from db.episodes import get_session_episodes
from db.sessions import close_session
from services.meta_agent import run_meta_agent

router = APIRouter()

@router.post("/session/end")
async def end_session(req: SessionEndRequest):
    user     = get_user(req.user_id)
    episodes = get_session_episodes(req.session_id)

    avg_reward = None
    if episodes:
        rewards    = [e["reward"] for e in episodes if e.get("reward") is not None]
        avg_reward = round(sum(rewards) / len(rewards), 2) if rewards else None

    # RSI: meta-agent analyzes session and upgrades user profile
    insights = run_meta_agent(req.user_id, req.session_id, user)
    close_session(req.session_id, avg_reward, insights)

    return {
        "session_id":  req.session_id,
        "avg_reward":  avg_reward,
        "insights":    insights,
        "turns":       len(episodes),
    }
