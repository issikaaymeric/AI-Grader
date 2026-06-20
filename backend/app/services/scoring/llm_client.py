"""
llm_client.py

Provider waterfall, tried in order until one succeeds:
  1. Gemini      — key pool x model fallback chain (free tier)
  2. DeepSeek     — OpenAI-compatible
  3. NVIDIA NIM   — OpenAI-compatible (Llama/Qwen/Mistral hosted chat models)
  4. Mistral      — native API, key pool
  5. GitHub Models — Azure AI Inference-compatible marketplace

429 / quota-exhausted on any provider -> skip immediately, no sleep.
"""
from __future__ import annotations

import json
import logging
import re

from app.core.config import settings

logger = logging.getLogger(__name__)

# The evaluator prompt asks for: chain_of_thought array, instructions_alignment,
# 4+ dimension scores (each with evidence quotes + reasoning), a 4-part SWOT,
# 2-4 next_steps, and a 3-5 paragraph anchored_feedback narrative. That routinely
# runs well past 4-8k tokens for a thorough response — too small a cap is the
# most common cause of "Unterminated string" JSON parse failures (the model gets
# cut off mid-response, not because it produced malformed JSON).
MAX_OUTPUT_TOKENS = 16384


# ── Gemini ────────────────────────────────────────────────────────────────────

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

def _gemini_once(api_key: str, model: str, system: str, user: str) -> str:
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=api_key)
    resp = client.models.generate_content(
        model=model,
        config=types.GenerateContentConfig(
            system_instruction=system,
            temperature=0.2,
            max_output_tokens=MAX_OUTPUT_TOKENS,
        ),
        contents=user,
    )
    return resp.text


# ── DeepSeek (OpenAI-compatible) ─────────────────────────────────────────────

DEEPSEEK_BASE_URL = "https://api.deepseek.com"
DEEPSEEK_MODEL    = "deepseek-chat"

def _deepseek_once(system: str, user: str) -> str:
    from openai import OpenAI

    if not settings.DEEPSEEK_API_KEY:
        raise RuntimeError("DEEPSEEK_API_KEY not set")

    client = OpenAI(api_key=settings.DEEPSEEK_API_KEY, base_url=DEEPSEEK_BASE_URL)
    resp = client.chat.completions.create(
        model=DEEPSEEK_MODEL,
        temperature=0.2,
        max_tokens=MAX_OUTPUT_TOKENS,
        messages=[
            {"role": "system", "content": system},
            {"role": "user",   "content": user},
        ],
    )
    return resp.choices[0].message.content


# ── NVIDIA NIM (OpenAI-compatible chat — NOT the embeddings endpoint) ───────

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
        temperature=0.2,
        max_tokens=MAX_OUTPUT_TOKENS,
        messages=[
            {"role": "system", "content": system},
            {"role": "user",   "content": user},
        ],
    )
    return resp.choices[0].message.content


# ── Mistral (native API, key pool) ───────────────────────────────────────────

MISTRAL_MODEL = "mistral-large-latest"

def _mistral_pool() -> list[str]:
    keys = [settings.MISTRAL_API_KEY, settings.MISTRAL_API_KEY_2]
    return [k for k in keys if k]

def _mistral_once(api_key: str, system: str, user: str) -> str:
    from mistralai import Mistral

    client = Mistral(api_key=api_key)
    resp = client.chat.complete(
        model=MISTRAL_MODEL,
        temperature=0.2,
        max_tokens=MAX_OUTPUT_TOKENS,
        messages=[
            {"role": "system", "content": system},
            {"role": "user",   "content": user},
        ],
    )
    return resp.choices[0].message.content


# ── GitHub Models (Azure AI Inference-compatible) ────────────────────────────

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
        temperature=0.2,
        # GitHub Models marketplace caps gpt-4o-mini context/output lower than
        # the other providers regardless of what we request; this is provider's
        # actual ceiling, not a knob we can raise to match MAX_OUTPUT_TOKENS.
        max_tokens=4096,
        messages=[
            {"role": "system", "content": system},
            {"role": "user",   "content": user},
        ],
    )
    return resp.choices[0].message.content


# ── Public interface ──────────────────────────────────────────────────────────

def _is_quota_error(exc: Exception) -> bool:
    s = str(exc)
    return "429" in s or "RESOURCE_EXHAUSTED" in s or "rate" in s.lower()


def call_llm(system_prompt: str, user_prompt: str) -> str:
    """
    Waterfall through every provider/model/key combination.
    Stops at the first success. Logs which provider/model actually served
    the response, so truncated-JSON failures downstream can be traced back
    to a specific provider instead of being indistinguishable.
    """
    last_exc: Exception | None = None

    # 1. Gemini — key pool x model chain
    for model in GEMINI_MODELS:
        for api_key in _gemini_pool():
            try:
                logger.info("Trying Gemini model=%s key=...%s", model, api_key[-6:])
                result = _gemini_once(api_key, model, system_prompt, user_prompt)
                logger.info(
                    "Gemini succeeded: model=%s key=...%s (%d chars)",
                    model, api_key[-6:], len(result),
                )
                return result
            except Exception as exc:
                logger.warning(
                    "Gemini %s key=...%s — %s", model, api_key[-6:],
                    "quota exhausted" if _is_quota_error(exc) else str(exc),
                )
                last_exc = exc

    # 2. DeepSeek
    try:
        logger.info("Trying DeepSeek (%s)", DEEPSEEK_MODEL)
        result = _deepseek_once(system_prompt, user_prompt)
        logger.info("DeepSeek succeeded: %s (%d chars)", DEEPSEEK_MODEL, len(result))
        return result
    except Exception as exc:
        logger.warning("DeepSeek failed: %s", exc)
        last_exc = exc

    # 3. NVIDIA NIM — model fallback chain
    for model in NVIDIA_MODELS:
        try:
            logger.info("Trying NVIDIA NIM (%s)", model)
            result = _nvidia_once(model, system_prompt, user_prompt)
            logger.info("NVIDIA NIM succeeded: %s (%d chars)", model, len(result))
            return result
        except Exception as exc:
            logger.warning("NVIDIA %s failed: %s", model, exc)
            last_exc = exc

    # 4. Mistral — key pool
    for api_key in _mistral_pool():
        try:
            logger.info("Trying Mistral key=...%s", api_key[-6:])
            result = _mistral_once(api_key, system_prompt, user_prompt)
            logger.info("Mistral succeeded: key=...%s (%d chars)", api_key[-6:], len(result))
            return result
        except Exception as exc:
            logger.warning("Mistral key=...%s failed: %s", api_key[-6:], exc)
            last_exc = exc

    # 5. GitHub Models
    try:
        logger.info("Trying GitHub Models (%s)", GITHUB_MODEL)
        result = _github_models_once(system_prompt, user_prompt)
        logger.info("GitHub Models succeeded: %s (%d chars)", GITHUB_MODEL, len(result))
        return result
    except Exception as exc:
        logger.warning("GitHub Models failed: %s", exc)
        last_exc = exc

    raise RuntimeError(
        "All providers exhausted (Gemini, DeepSeek, NVIDIA, Mistral, GitHub Models). "
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
    """
    Walk the raw text and find the last position where bracket depth returns
    to zero — i.e. the last point at which the JSON was structurally complete.
    Returns the original string unmodified if no complete top-level structure
    was ever found (depth never reached 0), so callers can detect that case
    rather than silently truncating to an empty/garbage result.
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
    """
    A repaired dict can be syntactically valid JSON while still missing the
    fields evaluate()/_assemble_result() actually needs (e.g. repair truncated
    mid-way through dimension_scores and silently closed the brackets there).
    Treat that as a failure rather than letting a near-empty result through,
    since a near-empty GradingResult with status="done" looks identical to a
    real one to the frontend and a polling client has no way to tell.
    """
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
        logger.warning(
            "JSON parsed but missing required keys %s — treating as failure.",
            _REQUIRED_TOP_LEVEL_KEYS,
        )
    except json.JSONDecodeError as exc:
        logger.warning("JSON parse failed (%s) — trying truncation repair...", exc)

    try:
        repaired_text = _repair_truncated_json(cleaned)
        result = json.loads(repaired_text)
        if _looks_usable(result):
            logger.info("Truncation repair recovered a usable result.")
            return result
        logger.warning(
            "Truncation repair produced valid JSON but missing required keys — "
            "trying json-repair library..."
        )
    except json.JSONDecodeError as exc:
        logger.warning("Truncation repair failed (%s) — trying json-repair library...", exc)

    try:
        result = _repair_with_library(cleaned)
        if _looks_usable(result):
            logger.info("json-repair library successfully recovered a usable result.")
            return result
        logger.warning("json-repair library recovered JSON but it's still missing required keys.")
    except Exception as exc:
        logger.warning("json-repair library failed: %s", exc)

    logger.error(
        "All JSON repair strategies failed or produced unusable results. "
        "Raw response (first 500 / last 500 chars): %s ... %s",
        cleaned[:500], cleaned[-500:],
    )
    raise RuntimeError(
        "LLM returned invalid or incomplete JSON and all repair attempts failed "
        "to produce a usable result (missing required fields: summary, "
        "dimension_scores, or swot). This usually means the response was "
        "truncated before the model finished — check MAX_OUTPUT_TOKENS and "
        "which provider served the request in the logs above."
    )