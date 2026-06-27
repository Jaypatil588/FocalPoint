import json
import google.generativeai as genai
from db.users import update_user, add_prospective_flag
from db.episodes import get_session_episodes

META_PROMPT = """
You are a learning analyst for FocalPoint, an AI that adapts to how users read.

You have access to a user's complete reading session — each turn shows what was said,
how the user read it (gaze events), and what reward score it received.

Your job: analyze patterns and update the user model.

Session episodes:
{episodes}

Current user profile:
{profile}

Respond with a JSON object (no markdown, raw JSON only):
{{
  "insights": ["insight 1", "insight 2", "insight 3"],
  "profile_updates": {{
    "complexity_score": <int 1-10>,
    "preferred_format": "<bullets|prose>",
    "topics_to_simplify": ["topic1", "topic2"]
  }},
  "new_prospective_flags": [
    {{"topic": "topic name", "action": "<simplify|use_analogy>"}}
  ]
}}
"""

def run_meta_agent(user_id: str, session_id: str, current_profile: dict) -> list[str]:
    episodes = get_session_episodes(session_id)
    if not episodes:
        return []

    prompt = META_PROMPT.format(
        episodes=json.dumps(episodes, indent=2, default=str),
        profile=json.dumps(current_profile, indent=2, default=str),
    )

    try:
        model    = genai.GenerativeModel(model_name="gemini-2.0-flash")
        response = model.generate_content(prompt)
        raw      = response.text.strip()

        # Strip markdown fences if model adds them
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]

        result = json.loads(raw)

        # Apply profile updates
        if updates := result.get("profile_updates"):
            update_user(user_id, updates)

        # Apply prospective flags
        for flag in result.get("new_prospective_flags", []):
            add_prospective_flag(user_id, flag)

        return result.get("insights", [])

    except Exception as e:
        print(f"[meta_agent] failed: {e}")
        return []
