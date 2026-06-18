"""
llm_client.py
Wraps Gemini SDKs with:
  - Key-pool rotation across redundant API keys.
  - Tenacity retry with exponential back-off.
  - Provider fallback (Gemini).
"""
from __future__ import annotations

import itertools
import json
import logging
from typing import Iterator

from tenacity import (
    retry,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential,
)

from app.core.config import settings

logger = logging.getLogger(__name__)


# ── Key pools ───────────────────────────────────────────────────────────────

def _cycle(keys: list[str]) -> Iterator[str]:
    """Infinite round-robin over a list; raises if empty."""
    if not keys:
        raise RuntimeError("No API keys configured for this provider.")
    return itertools.cycle(keys)


_gemini_keys: Iterator[str] = _cycle([
    settings.GEMINI_API_KEY_1,
    settings.GEMINI_API_KEY_2,
    settings.GEMINI_API_KEY_3,
    settings.GEMINI_API_KEY_4
]) if any([settings.GEMINI_API_KEY_1, settings.GEMINI_API_KEY_2, settings.GEMINI_API_KEY_3, settings.GEMINI_API_KEY_4]) else iter([])


# ── Gemini call ──────────────────────────────────────────────────────────

@retry(
    retry=retry_if_exception_type(Exception),
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    reraise=True,
)
def _call_gemini(system_prompt: str, user_prompt: str) -> str:
    import google.generativeai as genai  # lazy import

    api_key = next(_gemini_keys)
    client = genai.GenerativeModel(api_key=api_key)
    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=4096,
        temperature=0.3,
        system=system_prompt,
        messages=[{"role": "user", "content": user_prompt}],
    )
    return message.content[0].text




# ── Public interface ─────────────────────────────────────────────────────────

def call_llm(system_prompt: str, user_prompt: str) -> str:
    """
    Try the primary provider first; fall back to the secondary.
    Returns raw text from the LLM.
    """
    primary = settings.PRIMARY_LLM_PROVIDER
    providers = (
        [_call_gemini]
        if primary == "gemini"
        else [_call_gemini]
    )

    last_exc: Exception | None = None
    for fn in providers:
        try:
            return fn(system_prompt, user_prompt)
        except Exception as exc:
            logger.warning("LLM provider %s failed: %s", fn.__name__, exc)
            last_exc = exc

    raise RuntimeError(f"All LLM providers exhausted. Last error: {last_exc}") from last_exc


def call_llm_json(system_prompt: str, user_prompt: str) -> dict:
    """Convenience wrapper that parses the LLM response as JSON."""
    raw = call_llm(system_prompt, user_prompt)
    # Strip markdown fences if present
    cleaned = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    return json.loads(cleaned)
