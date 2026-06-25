"""
llm_client.py

Provider waterfall:
  1. DeepSeek     — OpenAI-compatible (primary)
  2. NVIDIA NIM
  3. Mistral
  4. Groq
  5. GitHub Models (gpt-4o-mini, 4 096-token output cap — last resort)
"""

from __future__ import annotations

import json
import logging
import re

from app.core.config import settings

logger = logging.getLogger(__name__)

MAX_OUTPUT_TOKENS = 16_384


# ── DeepSeek ──────────────────────────────────────────────────────────────────

DEEPSEEK_BASE_URL = "https://api.deepseek.com"
DEEPSEEK_MODEL    = "deepseek-chat"


def _deepseek_once(system: str, user: str) -> tuple[str, str | None]:
    """Returns (content, finish_reason)."""
    from openai import OpenAI

    if not settings.DEEPSEEK_API_KEY:
        raise RuntimeError("DEEPSEEK_API_KEY not set")

    client = OpenAI(api_key=settings.DEEPSEEK_API_KEY, base_url=DEEPSEEK_BASE_URL)
    resp = client.chat.completions.create(
        model=DEEPSEEK_MODEL,
        temperature=0.1,
        max_tokens=MAX_OUTPUT_TOKENS,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": system},
            {"role": "user",   "content": user},
        ],
    )
    choice = resp.choices[0]
    return choice.message.content, choice.finish_reason


# ── NVIDIA NIM ────────────────────────────────────────────────────────────────

NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1"
NVIDIA_MODELS = [
    "meta/llama-3.3-70b-instruct",
    "qwen/qwen2.5-72b-instruct",
    "mistralai/mistral-large-2-instruct",
]


def _nvidia_once(model: str, system: str, user: str) -> tuple[str, str | None]:
    from openai import OpenAI

    if not settings.NVIDIA_API_KEY:
        raise RuntimeError("NVIDIA_API_KEY not set")

    client = OpenAI(api_key=settings.NVIDIA_API_KEY, base_url=NVIDIA_BASE_URL)
    resp = client.chat.completions.create(
        model=model,
        temperature=0.1,
        max_tokens=MAX_OUTPUT_TOKENS,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": system},
            {"role": "user",   "content": user},
        ],
    )
    choice = resp.choices[0]
    return choice.message.content, choice.finish_reason


# ── Mistral ───────────────────────────────────────────────────────────────────

MISTRAL_MODEL = "mistral-large-latest"


def _mistral_pool() -> list[str]:
    keys = [settings.MISTRAL_API_KEY, settings.MISTRAL_API_KEY_2]
    return [k for k in keys if k]


def _mistral_once(api_key: str, system: str, user: str) -> tuple[str, str | None]:
    from mistralai import Mistral

    client = Mistral(api_key=api_key)
    resp = client.chat.complete(
        model=MISTRAL_MODEL,
        temperature=0.1,
        max_tokens=MAX_OUTPUT_TOKENS,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": system},
            {"role": "user",   "content": user},
        ],
    )
    choice = resp.choices[0]
    # Mistral uses "stop" / "length" like OpenAI
    finish_reason = getattr(choice, "finish_reason", None)
    if finish_reason is not None:
        finish_reason = str(finish_reason)
    return choice.message.content, finish_reason


# ── Groq ──────────────────────────────────────────────────────────────────────

GROQ_BASE_URL = "https://api.groq.com/openai/v1"
GROQ_MODELS = [
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
    "gemma2-9b-it",
]


def _groq_once(model: str, system: str, user: str) -> tuple[str, str | None]:
    from openai import OpenAI

    if not settings.GROQ_API_KEY:
        raise RuntimeError("GROQ_API_KEY not set")

    client = OpenAI(api_key=settings.GROQ_API_KEY, base_url=GROQ_BASE_URL)
    resp = client.chat.completions.create(
        model=model,
        temperature=0.1,
        max_tokens=MAX_OUTPUT_TOKENS,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": system},
            {"role": "user",   "content": user},
        ],
    )
    choice = resp.choices[0]
    return choice.message.content, choice.finish_reason


# ── GitHub Models (last resort — 4 096-token output cap) ─────────────────────

GITHUB_MODELS_ENDPOINT = "https://models.inference.ai.azure.com"
GITHUB_MODEL = "gpt-4o-mini"


def _github_models_once(system: str, user: str) -> tuple[str, str | None]:
    from openai import OpenAI

    if not settings.GITHUB_MICROSOFT_MODEL_API_KEY:
        raise RuntimeError("GITHUB_MICROSOFT_MODEL_API_KEY not set")

    client = OpenAI(
        api_key=settings.GITHUB_MICROSOFT_MODEL_API_KEY,
        base_url=GITHUB_MODELS_ENDPOINT,
    )
    resp = client.chat.completions.create(
        model=GITHUB_MODEL,
        temperature=0.1,
        max_tokens=4096,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": system},
            {"role": "user",   "content": user},
        ],
    )
    choice = resp.choices[0]
    return choice.message.content, choice.finish_reason


# ── Helpers ───────────────────────────────────────────────────────────────────

def _is_quota_error(exc: Exception) -> bool:
    s = str(exc).lower()
    return "429" in s or "resource_exhausted" in s or "rate" in s or "quota" in s


def _was_truncated(finish_reason: str | None) -> bool:
    """Return True when the provider cut the response short due to token limit."""
    return finish_reason in ("length", "max_tokens")


# ── Public interface ──────────────────────────────────────────────────────────

def call_llm(system_prompt: str, user_prompt: str) -> str:
    """
    Waterfall through providers.
    If a provider returns finish_reason='length' the output was truncated —
    skip straight to the next provider instead of trying to parse broken JSON.
    """
    last_exc: Exception | None = None

    # 1. DeepSeek (Primary)
    try:
        logger.info("Trying DeepSeek (%s)", DEEPSEEK_MODEL)
        content, finish_reason = _deepseek_once(system_prompt, user_prompt)
        if _was_truncated(finish_reason):
            logger.warning("DeepSeek truncated output (finish_reason=%s), trying next provider", finish_reason)
        else:
            logger.info("DeepSeek succeeded (%d chars)", len(content))
            return content
    except Exception as exc:
        logger.warning("DeepSeek failed: %s", exc)
        last_exc = exc

    # 2. NVIDIA NIM
    for model in NVIDIA_MODELS:
        try:
            logger.info("Trying NVIDIA NIM (%s)", model)
            content, finish_reason = _nvidia_once(model, system_prompt, user_prompt)
            if _was_truncated(finish_reason):
                logger.warning("NVIDIA %s truncated (finish_reason=%s), trying next", model, finish_reason)
                continue
            logger.info("NVIDIA NIM succeeded: %s (%d chars)", model, len(content))
            return content
        except Exception as exc:
            logger.warning("NVIDIA %s failed: %s", model, exc)
            last_exc = exc

    # 3. Mistral
    for api_key in _mistral_pool():
        try:
            logger.info("Trying Mistral key=...%s", api_key[-6:])
            content, finish_reason = _mistral_once(api_key, system_prompt, user_prompt)
            if _was_truncated(finish_reason):
                logger.warning("Mistral truncated (finish_reason=%s), trying next", finish_reason)
                continue
            logger.info("Mistral succeeded: key=...%s (%d chars)", api_key[-6:], len(content))
            return content
        except Exception as exc:
            logger.warning("Mistral key=...%s failed: %s", api_key[-6:], exc)
            last_exc = exc

    # 4. Groq
    for model in GROQ_MODELS:
        try:
            logger.info("Trying Groq model=%s", model)
            content, finish_reason = _groq_once(model, system_prompt, user_prompt)
            if _was_truncated(finish_reason):
                logger.warning("Groq %s truncated (finish_reason=%s), trying next", model, finish_reason)
                continue
            logger.info("Groq succeeded: %s (%d chars)", model, len(content))
            return content
        except Exception as exc:
            logger.warning("Groq %s failed: %s", model, exc)
            last_exc = exc

    # 5. GitHub Models (last resort — hard 4 096-token output cap)
    try:
        logger.info("Trying GitHub Models (%s)", GITHUB_MODEL)
        content, finish_reason = _github_models_once(system_prompt, user_prompt)
        if _was_truncated(finish_reason):
            logger.warning("GitHub Models truncated (finish_reason=%s)", finish_reason)
            # No more providers — fall through to raise below
        else:
            logger.info("GitHub Models succeeded (%d chars)", len(content))
            return content
    except Exception as exc:
        logger.warning("GitHub Models failed: %s", exc)
        last_exc = exc

    raise RuntimeError(
        "All providers exhausted (DeepSeek, NVIDIA, Mistral, Groq, GitHub Models). "
        f"Last error: {last_exc}"
    ) from last_exc


# ── JSON repair helpers ───────────────────────────────────────────────────────

def _extract_json_block(text: str) -> str:
    cleaned = (
        text.strip()
        .removeprefix("```json")
        .removeprefix("```")
        .removesuffix("```")
        .strip()
    )
    match = re.search(r"[\[{]", cleaned)
    if match and match.start() > 0:
        cleaned = cleaned[match.start():]
    return cleaned


def _repair_truncated_json(raw: str) -> str:
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
    try:
        from json_repair import repair_json
        repaired = repair_json(raw, return_objects=True)
        if isinstance(repaired, dict):
            return repaired
        if isinstance(repaired, str):
            return json.loads(repaired)
        raise ValueError(f"json_repair returned unexpected type: {type(repaired)}")
    except ImportError:
        raise RuntimeError("json-repair is not installed. Run: pip install json-repair")


_REQUIRED_TOP_LEVEL_KEYS = ("summary", "dimension_scores", "swot")


def _looks_usable(result: dict) -> bool:
    if not isinstance(result, dict):
        return False
    return all(key in result and result[key] for key in _REQUIRED_TOP_LEVEL_KEYS)


def call_llm_json(system_prompt: str, user_prompt: str) -> dict:
    raw = call_llm(system_prompt, user_prompt)
    cleaned = _extract_json_block(raw)

    try:
        result = json.loads(cleaned)
        if _looks_usable(result):
            return result
    except json.JSONDecodeError:
        pass

    try:
        repaired_text = _repair_truncated_json(cleaned)
        result = json.loads(repaired_text)
        if _looks_usable(result):
            logger.info("Truncation repair recovered usable JSON.")
            return result
    except json.JSONDecodeError:
        pass

    try:
        result = _repair_with_library(cleaned)
        if _looks_usable(result):
            logger.info("json-repair library recovered usable JSON.")
            return result
    except Exception as exc:
        logger.warning("json-repair failed: %s", exc)

    logger.error(
        "All repair strategies failed. Raw response: %s ... %s",
        cleaned[:500], cleaned[-500:],
    )
    raise RuntimeError(
        "LLM returned invalid or incomplete JSON. Check MAX_OUTPUT_TOKENS "
        "and provider logs above."
    )