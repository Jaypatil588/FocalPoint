import re
from models import ContextPacket, HistoryMessage
from services.prompt_builder import build_system_prompt


def token_upper_bound(system_prompt, query, history):
    # UTF-8 byte count bounds byte-tokenizer payload size; reserve framing overhead.
    return (len(system_prompt.encode()) + len(query.encode()) +
            sum(len(item.content.encode()) for item in history) + 32 * (len(history) + 2))


def build_context_packet(messages, memories, query, profile, policy):
    terms = set(re.findall(r"\w+", query.lower()))
    eligible = [memory for memory in memories
                if memory.confidence >= 0.4 and (memory.topic is None or memory.topic in terms)]
    eligible.sort(key=lambda memory: (memory.topic is not None, memory.confidence,
                                     memory.evidence_count, memory.memory_id), reverse=True)
    selected = []
    system_prompt = build_system_prompt(profile, policy)
    if token_upper_bound(system_prompt, query, []) > policy.context.max_input_tokens:
        raise ValueError("mandatory prompt and query exceed the input token budget")
    for memory in eligible[:policy.context.max_memories]:
        candidate_prompt = build_system_prompt(profile, policy, selected + [memory])
        if token_upper_bound(candidate_prompt, query, []) <= policy.context.max_input_tokens:
            selected.append(memory)
            system_prompt = candidate_prompt

    if len(messages) % 2:
        raise ValueError("stored history must contain complete exchanges")
    for index in range(0, len(messages), 2):
        if messages[index]["role"] != "user" or messages[index + 1]["role"] != "assistant":
            raise ValueError("invalid stored conversation ordering")
    history = []
    for index in range(len(messages) - 2, -1, -2):
        pair = [HistoryMessage(role=item["role"], content=item["text"], message_id=item["message_id"])
                for item in messages[index:index + 2]]
        if len(history) + 2 > policy.context.max_history_messages:
            break
        if token_upper_bound(system_prompt, query, pair + history) > policy.context.max_input_tokens:
            break
        history = pair + history
    return ContextPacket(history=history, memories=selected, system_prompt=system_prompt, query=query,
                         estimated_input_tokens=token_upper_bound(system_prompt, query, history),
                         token_budget=policy.context.max_input_tokens, omitted_messages=len(messages) - len(history))
