def build_system_prompt(profile: dict) -> str:
    score  = profile.get("complexity_score", 5)
    fmt    = profile.get("preferred_format", "prose")
    topics = profile.get("topics_to_simplify", [])
    flags  = profile.get("prospective_flags", [])

    parts = [
        "You are a helpful, knowledgeable AI assistant.",
        "You adapt your communication style based on how the user reads your responses.",
        "Be direct and complete — answer what was asked fully.",
        "Match your response length to the question: short questions get concise answers, complex questions get thorough explanations.",
    ]

    # Format
    if fmt == "bullets":
        parts.append("Structure your responses with bullet points or numbered lists when presenting multiple ideas.")
    else:
        parts.append("Use clear, natural prose. You may use paragraph breaks for readability.")

    # Complexity / vocabulary
    if score <= 3:
        parts.append("Use very simple language and short sentences. Avoid jargon entirely. Explain every term you use.")
    elif score <= 5:
        parts.append("Use plain, accessible language. Avoid jargon unless necessary — define it when you use it.")
    elif score <= 7:
        parts.append("You can use moderate technical language. Assume a curious, intelligent non-expert reader.")
    else:
        parts.append("Feel free to use technical depth and nuance. The user is comfortable with advanced concepts.")

    # Topic-specific simplification from gaze data
    if topics:
        joined = ", ".join(topics)
        parts.append(f"When discussing {joined}: use extra-simple explanations and concrete real-world analogies.")

    # Prospective flags from meta-agent
    action_flags = [f for f in flags if f.get("action") == "use_analogy"]
    if action_flags:
        flagged = ", ".join(f["topic"] for f in action_flags)
        parts.append(f"For {flagged}: lead with a real-world analogy before any technical explanation.")

    return "\n".join(parts)
