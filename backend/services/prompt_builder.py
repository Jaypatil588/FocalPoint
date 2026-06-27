def build_system_prompt(profile: dict) -> str:
    score  = profile.get("complexity_score", 5)
    fmt    = profile.get("preferred_format", "prose")
    avg    = profile.get("avg_words_read", 200)
    topics = profile.get("topics_to_simplify", [])
    flags  = profile.get("prospective_flags", [])

    parts = [
        "You are FocalPoint, a helpful AI assistant that adapts to how the user reads.",
        "Your goal is always clarity over completeness.",
    ]

    # Format
    if fmt == "bullets":
        parts.append("Always structure your response as bullet points or numbered lists. Avoid long prose paragraphs.")
    else:
        parts.append("Use clear, flowing prose. Paragraph breaks are fine.")

    # Complexity / vocabulary
    if score <= 3:
        parts.append("Use very simple language. Short sentences. No jargon whatsoever. Explain every technical term.")
    elif score <= 5:
        parts.append("Use plain language. Avoid technical jargon unless necessary, and define it when you use it.")
    elif score <= 7:
        parts.append("You can use moderate technical language. Assume a curious but non-expert reader.")
    else:
        parts.append("You can use technical depth and nuance. The user is comfortable with advanced concepts.")

    # Length
    word_limit = max(80, avg + 40)
    parts.append(f"Keep your response under {word_limit} words.")

    # Topic-specific simplification
    if topics:
        joined = ", ".join(topics)
        parts.append(f"When discussing {joined}: use extra-simple explanations and concrete analogies.")

    # Prospective flags
    action_flags = [f for f in flags if f.get("action") == "use_analogy"]
    if action_flags:
        flagged = ", ".join(f["topic"] for f in action_flags)
        parts.append(f"For {flagged}: lead with a real-world analogy before explaining technically.")

    return " ".join(parts)
