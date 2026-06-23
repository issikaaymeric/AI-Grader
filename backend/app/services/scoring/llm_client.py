"""
llm_client.py

Provider waterfall (Gemini removed as requested):
  1. DeepSeek     — OpenAI-compatible (primary now)
  2. NVIDIA NIM
  3. Mistral
  4. GitHub Models
"""

from __future__ import annotations

import json
import logging
import re

from app.core.config import settings

logger = logging.getLogger(__name__)

MAX_OUTPUT_TOKENS = 16384


# ── DeepSeek (Primary) ───────────────────────────────────────────────────────

DEEPSEEK_BASE_URL = "https://api.deepseek.com"
DEEPSEEK_MODEL    = "deepseek-chat"

def _deepseek_once(system: str, user: str) -> str:
    from openai import OpenAI

    if not settings.DEEPSEEK_API_KEY:
        raise RuntimeError("DEEPSEEK_API_KEY not set")

    client = OpenAI(api_key=settings.DEEPSEEK_API_KEY, base_url=DEEPSEEK_BASE_URL)
    resp = client.chat.completions.create(
        model=DEEPSEEK_MODEL,
        temperature=0.1,                    # Lower = more deterministic
        max_tokens=MAX_OUTPUT_TOKENS,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": system},
            {"role": "user",   "content": user},
        ],
    )
    return resp.choices[0].message.content


# ── NVIDIA NIM ───────────────────────────────────────────────────────────────

NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1"
NVIDIA_MODELS = [
    "meta/llama-3.3-70b-instruct",
    "qwen/qwen2.5-72b-instruct",
    "mistralai/mistral-large-2-instruct",
]

def _nvidia_once(model: str, system: str, user: str) -> str:
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
    return resp.choices[0].message.content


# ── Mistral ──────────────────────────────────────────────────────────────────

MISTRAL_MODEL = "mistral-large-latest"

def _mistral_pool() -> list[str]:
    keys = [settings.MISTRAL_API_KEY, settings.MISTRAL_API_KEY_2]
    return [k for k in keys if k]

def _mistral_once(api_key: str, system: str, user: str) -> str:
    from mistralai import Mistral

    client = Mistral(api_key=api_key)
    resp = client.chat.complete(
        model=MISTRAL_MODEL,
        temperature=0.1,
        max_tokens=MAX_OUTPUT_TOKENS,
        # Mistral native API uses different param for JSON mode
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": system},
            {"role": "user",   "content": user},
        ],
    )
    return resp.choices[0].message.content


# ── GitHub Models ────────────────────────────────────────────────────────────

GITHUB_MODELS_ENDPOINT = "https://models.inference.ai.azure.com"
GITHUB_MODEL = "gpt-4o-mini"

def _github_models_once(system: str, user: str) -> str:
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
    return resp.choices[0].message.content


# ── Groq (NEW) ───────────────────────────────────────────────────────────────
GROQ_BASE_URL = "https://api.groq.com/openai/v1"
GROQ_MODELS = [
    "llama-3.3-70b-versatile",      # Best balance
    "llama-3.1-8b-instant",         # Faster fallback
    "gemma2-9b-it",
]

def _groq_once(model: str, system: str, user: str) -> str:
    from openai import OpenAI

    if not settings.GROQ_API_KEY:
        raise RuntimeError("GROQ_API_KEY not set")

    client = OpenAI(api_key=settings.GROQ_API_KEY, base_url=GROQ_BASE_URL)
    resp = client.chat.completions.create(
        model=model,
        temperature=0.1,
        max_tokens=MAX_OUTPUT_TOKENS,
        response_format={"type": "json_object"},
        messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
    )
    return resp.choices[0].message.content
    


# ── Public interface ──────────────────────────────────────────────────────────

def _is_quota_error(exc: Exception) -> bool:
    s = str(exc).lower()
    return "429" in s or "resource_exhausted" in s or "rate" in s or "quota" in s


def call_llm(system_prompt: str, user_prompt: str) -> str:
    """Waterfall through providers. DeepSeek is now first."""
    last_exc: Exception | None = None

    # 1. DeepSeek (Primary)
    try:
        logger.info("Trying DeepSeek (%s)", DEEPSEEK_MODEL)
        result = _deepseek_once(system_prompt, user_prompt)
        logger.info("DeepSeek succeeded: %s (%d chars)", DEEPSEEK_MODEL, len(result))
        return result
    except Exception as exc:
        logger.warning("DeepSeek failed: %s", exc)
        last_exc = exc

    # 2. NVIDIA NIM
    for model in NVIDIA_MODELS:
        try:
            logger.info("Trying NVIDIA NIM (%s)", model)
            result = _nvidia_once(model, system_prompt, user_prompt)
            logger.info("NVIDIA NIM succeeded: %s (%d chars)", model, len(result))
            return result
        except Exception as exc:
            logger.warning("NVIDIA %s failed: %s", model, exc)
            last_exc = exc

    # 3. Mistral
    for api_key in _mistral_pool():
        try:
            logger.info("Trying Mistral key=...%s", api_key[-6:])
            result = _mistral_once(api_key, system_prompt, user_prompt)
            logger.info("Mistral succeeded: key=...%s (%d chars)", api_key[-6:], len(result))
            return result
        except Exception as exc:
            logger.warning("Mistral key=...%s failed: %s", api_key[-6:], exc)
            last_exc = exc

    # 4. GitHub Models
    try:
        logger.info("Trying GitHub Models (%s)", GITHUB_MODEL)
        result = _github_models_once(system_prompt, user_prompt)
        logger.info("GitHub Models succeeded: %s (%d chars)", GITHUB_MODEL, len(result))
        return result
    except Exception as exc:
        logger.warning("GitHub Models failed: %s", exc)
        last_exc = exc
        
    # 2. Groq (NEW)
    for model in GROQ_MODELS:
        try:
            logger.info("Trying Groq model=%s", model)
            result = _groq_once(model, system_prompt, user_prompt)
            logger.info("Groq succeeded: %s (%d chars)", model, len(result))
            return result
        except Exception as exc:
            logger.warning("Groq %s failed: %s", model, exc)
            last_exc = exc

    raise RuntimeError(
        "All providers exhausted (DeepSeek, NVIDIA, Mistral, GitHub Models). "
        f"Last error: {last_exc}"
    ) from last_exc


# JSON repair helpers (unchanged - kept as-is)
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

    # Try repairs...
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

    logger.error("All repair strategies failed. Raw response: %s ... %s", 
                 cleaned[:500], cleaned[-500:])
    raise RuntimeError(
        "LLM returned invalid or incomplete JSON. Check MAX_OUTPUT_TOKENS "
        "and provider logs above."
    )