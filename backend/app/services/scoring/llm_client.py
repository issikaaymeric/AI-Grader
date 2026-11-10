"""
llm_client.py

Provider waterfall:
  1. DeepSeek     — OpenAI-compatible (primary)
  2. NVIDIA NIM
  3. Mistral
  4. Groq

GitHub Models was retired in July 2026 and is intentionally not used.
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
DEEPSEEK_MODEL    = "deepseek-flash"


def _deepseek_pool() -> list[str]:
    """Return configured DeepSeek keys in preferred order, without exposing them."""
    keys = [settings.DEEPSEEK_API_KEY, settings.DEEPSEEK_API_KEY1, settings.DEEPSEEK_API_KEY2]
    return list(dict.fromkeys(key.strip() for key in keys if key and key.strip()))


def _deepseek_once(api_key: str, system: str, user: str) -> tuple[str, str | None]:
    from openai import OpenAI
    if not api_key:
        raise RuntimeError("No DeepSeek API key configured")
    client = OpenAI(api_key=api_key, base_url=DEEPSEEK_BASE_URL, timeout=25.0, max_retries=0)
    resp = client.chat.completions.create(
        model=DEEPSEEK_MODEL, temperature=0.1, max_tokens=MAX_OUTPUT_TOKENS,
        response_format={"type": "json_object"},
        messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
    )
    choice = resp.choices[0]
    return choice.message.content, choice.finish_reason


# ── NVIDIA NIM ────────────────────────────────────────────────────────────────

NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1"
NVIDIA_MODELS = [
    "openai/gpt-oss-120b",
    "nvidia/llama-3.3-nemotron-super-49b-v1.5",
    "qwen/qwen3-next-80b-a3b-instruct",
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
    from mistralai.client import Mistral

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
    "openai/gpt-oss-120b",
    "qwen/qwen3.8-27b",
]


def _groq_once(
    model: str, system: str, user: str, json_schema: dict | None = None
) -> tuple[str, str | None]:
    from openai import OpenAI

    if not settings.GROQ_API_KEY:
        raise RuntimeError("GROQ_API_KEY not set")

    client = OpenAI(api_key=settings.GROQ_API_KEY, base_url=GROQ_BASE_URL)
    resp = client.chat.completions.create(
        model=model,
        temperature=0.1,
        max_tokens=MAX_OUTPUT_TOKENS,
        response_format=(
            {
                "type": "json_schema",
                "json_schema": {
                    "name": "grading_result",
                    "strict": True,
                    "schema": json_schema,
                },
            }
            if json_schema
            else {"type": "json_object"}
        ),
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

def call_llm(
    system_prompt: str, user_prompt: str, json_schema: dict | None = None
) -> str:
    """
    Waterfall through providers.
    If a provider returns finish_reason='length' the output was truncated —
    skip straight to the next provider instead of trying to parse broken JSON.
    """
    last_exc: Exception | None = None

    # 1. DeepSeek key pool (primary provider)
    deepseek_keys = _deepseek_pool()
    for key_index, api_key in enumerate(deepseek_keys, start=1):
        try:
            logger.info("Trying DeepSeek key slot %d/%d (%s)", key_index, len(deepseek_keys), DEEPSEEK_MODEL)
            content, finish_reason = _deepseek_once(api_key, system_prompt, user_prompt)
            if _was_truncated(finish_reason):
                logger.warning("DeepSeek key slot %d returned truncated output; trying next key/provider", key_index)
                continue
            logger.info("DeepSeek succeeded using key slot %d (%d chars)", key_index, len(content))
            return content
        except Exception as exc:
            logger.warning("DeepSeek key slot %d failed: %s", key_index, exc)
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
            content, finish_reason = _groq_once(
                model, system_prompt, user_prompt, json_schema=json_schema
            )
            if _was_truncated(finish_reason):
                logger.warning("Groq %s truncated (finish_reason=%s), trying next", model, finish_reason)
                continue
            logger.info("Groq succeeded: %s (%d chars)", model, len(content))
            return content
        except Exception as exc:
            logger.warning("Groq %s failed: %s", model, exc)
            last_exc = exc

    raise RuntimeError(
        "All configured AI providers exhausted (DeepSeek, NVIDIA, Mistral, Groq). "
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


def call_llm_json(
    system_prompt: str, user_prompt: str, json_schema: dict | None = None
) -> dict:
    raw = call_llm(system_prompt, user_prompt, json_schema=json_schema)
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