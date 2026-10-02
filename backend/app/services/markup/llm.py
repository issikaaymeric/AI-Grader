from __future__ import annotations

from app.services import llm_client


def complete(
    system: str,
    messages: list[dict[str, str]],
    *,
    max_tokens: int = 2048,
    temperature: float = 0.2,
) -> str:
    """Single integration point with the provider waterfall. Blocking."""
    payload = [{"role": "system", "content": system}, *messages]
    text = llm_client.complete(payload, max_tokens=max_tokens, temperature=temperature)
    if not text or not text.strip():
        raise RuntimeError("LLM returned an empty response.")
    return text
