"""
llm_client.py
Primary:  Gemini  (key pool × model fallback chain)
Fallback: DeepSeek (OpenAI-compatible endpoint)
429 / quota-exhausted → skip immediately, no sleep.
"""
from __future__ import annotations

import json
import logging
import re

from app.core.config import settings

logger = logging.getLogger(__name__)

# ── Gemini config ─────────────────────────────────────────────────────────────

def _gemini_pool() -> list[str]:
    keys = [
        settings.GEMINI_API_KEY_1,
        settings.GEMINI_API_KEY_2,
        settings.GEMINI_API_KEY_3,
        settings.GEMINI_API_KEY_4,
    ]
    return [k for k in keys if k]

GEMINI_MODELS = [
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    "gemini-2.5-flash",
    "gemini-2.5-pro",
]

# ── DeepSeek config ───────────────────────────────────────────────────────────

DEEPSEEK_BASE_URL = "https://api.deepseek.com"
DEEPSEEK_MODEL    = "deepseek-chat"   # DeepSeek-V3


# ── Single-call helpers ───────────────────────────────────────────────────────

def _gemini_once(api_key: str, model: str, system: str, user: str) -> str:
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=api_key)
    resp = client.models.generate_content(
        model=model,
        config=types.GenerateContentConfig(
            system_instruction=system,
            temperature=0.2,        # lower = more deterministic / less hallucination
            max_output_tokens=8192,
        ),
        contents=user,
    )
    return resp.text


def _deepseek_once(system: str, user: str) -> str:
    import httpx
    from openai import OpenAI

    api_key = settings.DEEPSEEK_API_KEY
    if not api_key:
        raise RuntimeError("DEEPSEEK_API_KEY is not set in .env")

    http_client = httpx.Client()
    client = OpenAI(
        api_key=api_key,
        base_url=DEEPSEEK_BASE_URL,
        http_client=http_client,
    )
    resp = client.chat.completions.create(
        model=DEEPSEEK_MODEL,
        temperature=0.2,
        max_tokens=8192,
        messages=[
            {"role": "system", "content": system},
            {"role": "user",   "content": user},
        ],
    )
    return resp.choices[0].message.content


# ── Public interface ──────────────────────────────────────────────────────────

def call_llm(system_prompt: str, user_prompt: str) -> str:
    """
    1. Try every Gemini (key × model) combination.
    2. If all Gemini options are exhausted/failed, fall back to DeepSeek.
    """
    pool = _gemini_pool()
    last_exc: Exception | None = None

    for model in GEMINI_MODELS:
        for api_key in pool:
            try:
                logger.info("Gemini model=%s key=...%s", model, api_key[-6:])
                return _gemini_once(api_key, model, system_prompt, user_prompt)
            except Exception as exc:
                is_quota = "429" in str(exc) or "RESOURCE_EXHAUSTED" in str(exc)
                logger.warning(
                    "Gemini %s key=...%s — %s",
                    model, api_key[-6:],
                    "quota exhausted, skipping" if is_quota else str(exc),
                )
                last_exc = exc

    try:
        logger.info("Falling back to DeepSeek (%s)", DEEPSEEK_MODEL)
        return _deepseek_once(system_prompt, user_prompt)
    except Exception as exc:
        logger.warning("DeepSeek failed: %s", exc)
        last_exc = exc

    raise RuntimeError(
        "All providers exhausted (Gemini + DeepSeek). "
        f"Last error: {last_exc}"
    ) from last_exc


# ── JSON repair helpers ───────────────────────────────────────────────────────

def _extract_json_block(text: str) -> str:
    """Strip markdown fences and extract the first JSON object or array."""
    # Remove markdown fences
    cleaned = (
        text.strip()
        .removeprefix("```json")
        .removeprefix("```")
        .removesuffix("```")
        .strip()
    )
    # If there's extra text before the JSON, find the first { or [
    match = re.search(r"[\[{]", cleaned)
    if match and match.start() > 0:
        cleaned = cleaned[match.start():]
    return cleaned


def _repair_truncated_json(raw: str) -> str:
    """
    Clip at the last position where the top-level brace/bracket depth
    returned to 0. Handles truncation mid-string.
    """
    depth = 0
    last_complete = 0
    in_string = False
    escape_next = False

    for i, ch in enumerate(raw):
        if escape_next:
            escape_next = False
            continue
        if ch == "\\" and in_string:
            escape_next = True
            continue
        if ch == '"':
            in_string = not in_string
            continue
        if in_string:
            continue
        if ch in "{[":
            depth += 1
        elif ch in "}]":
            depth -= 1
            if depth == 0:
                last_complete = i + 1

    return raw[:last_complete] if last_complete else raw


def _repair_with_library(raw: str) -> dict:
    """Use json-repair for structural corruption (bad commas, quotes, etc.)."""
    try:
        from json_repair import repair_json
        repaired = repair_json(raw, return_objects=True)
        if isinstance(repaired, dict):
            return repaired
        # repair_json returned a string — parse it
        if isinstance(repaired, str):
            return json.loads(repaired)
        raise ValueError(f"json_repair returned unexpected type: {type(repaired)}")
    except ImportError:
        raise RuntimeError(
            "json-repair is not installed. Run: pip install json-repair"
        )


def call_llm_json(system_prompt: str, user_prompt: str) -> dict:
    raw = call_llm(system_prompt, user_prompt)
    cleaned = _extract_json_block(raw)

    # Layer 1: clean parse
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as exc:
        logger.warning("JSON parse failed (%s) — trying truncation repair...", exc)

    # Layer 2: truncation repair (handles cut-off responses)
    try:
        repaired = _repair_truncated_json(cleaned)
        return json.loads(repaired)
    except json.JSONDecodeError as exc:
        logger.warning("Truncation repair failed (%s) — trying json-repair library...", exc)

    # Layer 3: json-repair library (handles structural corruption)
    try:
        result = _repair_with_library(cleaned)
        logger.info("json-repair library successfully recovered the response.")
        return result
    except Exception as exc:
        logger.error(
            "All JSON repair strategies failed. Raw response (first 500 chars): %s",
            cleaned[:500],
        )
        raise RuntimeError(
            f"LLM returned invalid JSON and all repair attempts failed: {exc}"
        ) from exc