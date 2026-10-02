from __future__ import annotations

import json

from app.services.llm_client import call_llm

_ROLE_LABELS = {"user": "Student", "assistant": "Assistant"}

_REPLY_INSTRUCTION = (
    '\n\nOutput format: respond with a single JSON object {"reply": "<your answer as '
    'plain text>"} and nothing else.'
)


def _flatten(messages: list[dict[str, str]]) -> str:
    """call_llm accepts one user string, so multi-turn history is rendered as a transcript."""
    if len(messages) == 1:
        return messages[0]["content"]
    transcript = "\n\n".join(
        f"{_ROLE_LABELS.get(m['role'], m['role'].title())}: {m['content']}" for m in messages
    )
    return f"Conversation so far:\n\n{transcript}\n\nRespond to the latest Student message."


def complete_json(system: str, messages: list[dict[str, str]]) -> str:
    """Raw JSON-mode completion through the provider waterfall. Blocking."""
    text = call_llm(system, _flatten(messages))
    if not text or not text.strip():
        raise RuntimeError("LLM returned an empty response.")
    return text


def complete_text(system: str, messages: list[dict[str, str]]) -> str:
    """
    Free-text answer. Every provider in the waterfall is forced into JSON mode,
    so the reply is requested as {"reply": "..."} and unwrapped here.
    """
    raw = complete_json(system + _REPLY_INSTRUCTION, messages)
    start, end = raw.find("{"), raw.rfind("}")
    if start != -1 and end > start:
        try:
            data = json.loads(raw[start : end + 1])
            reply = data.get("reply") if isinstance(data, dict) else None
            if isinstance(reply, str) and reply.strip():
                return reply.strip()
        except json.JSONDecodeError:
            pass
    return raw.strip()
