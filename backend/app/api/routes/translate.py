# translate.py — complete fixed file

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Any
import json
from concurrent.futures import ThreadPoolExecutor
import asyncio

from app.core.dependencies import CurrentUser
from app.services.scoring.llm_client import call_llm
from app.core.dependencies import require_auth

router = APIRouter(prefix="/api/translate", tags=["translate"])

SUPPORTED_LANGS = {"fr": "French"}

_executor = ThreadPoolExecutor(max_workers=2)


class TranslateRequest(BaseModel):
    content: dict[str, Any]
    target_lang: str

class TranslateResponse(BaseModel):
    translated: dict[str, Any]

class InsightRequest(BaseModel):
    history: list[dict[str, Any]]

class InsightResponse(BaseModel):
    insight: str


def _extract_insight(raw: str) -> str:
    """
    call_llm forces json_object mode on all providers, so even with a
    'plain text' system prompt the model returns {"insight": "..."}
    or some JSON envelope. Unwrap it; fall back to the raw string if
    it genuinely isn't JSON (shouldn't happen, but be defensive).
    """
    text = raw.strip()
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        # Not JSON — model somehow returned plain text; use as-is.
        return text

    if isinstance(parsed, str):
        return parsed

    if isinstance(parsed, dict):
        # Try common keys the model might choose
        for key in ("insight", "text", "message", "content", "result", "response"):
            if isinstance(parsed.get(key), str) and parsed[key].strip():
                return parsed[key].strip()
        # Last resort: concatenate all string values
        parts = [v for v in parsed.values() if isinstance(v, str) and v.strip()]
        if parts:
            return " ".join(parts)

    # Absolute fallback
    return text


@router.post("/insight", response_model=InsightResponse)
async def generate_insight(
    body: InsightRequest,
    current_user: CurrentUser,
):
    if not body.history:
        raise HTTPException(400, "No history provided")

    system_prompt = (
        "You are an academic performance coach. Analyze the student's grading history "
        "and return a JSON object with a single key \"insight\" whose value is a plain "
        "string of 3-4 sentences: what they're doing well, where they struggle, and one "
        "actionable recommendation. Be specific and encouraging. "
        "No markdown inside the string."
    )
    user_prompt = json.dumps(body.history, ensure_ascii=False)

    loop = asyncio.get_event_loop()
    try:
        raw = await loop.run_in_executor(_executor, call_llm, system_prompt, user_prompt)
    except Exception as e:
        raise HTTPException(502, f"LLM failed: {e}")

    insight = _extract_insight(raw)
    return InsightResponse(insight=insight)


@router.post("/grading-result", response_model=TranslateResponse)
async def translate_grading_result(
    body: TranslateRequest,
    current_user: CurrentUser,
):
    if body.target_lang not in SUPPORTED_LANGS:
        raise HTTPException(400, f"Unsupported language: {body.target_lang}")

    lang_name = SUPPORTED_LANGS[body.target_lang]

    system_prompt = (
        f"You are a translator. Translate grading feedback JSON values into {lang_name}. "
        "Translate only string VALUES. Never translate JSON keys, numeric scores, "
        "or annotation coordinates. Return ONLY valid JSON with identical structure. "
        "No markdown, no explanation."
    )
    user_prompt = json.dumps(body.content, ensure_ascii=False, indent=2)

    loop = asyncio.get_event_loop()
    try:
        raw = await loop.run_in_executor(
            _executor, call_llm, system_prompt, user_prompt
        )
    except Exception as e:
        raise HTTPException(502, f"LLM translation failed: {e}")

    clean = (
        raw.strip()
        .removeprefix("```json")
        .removeprefix("```")
        .removesuffix("```")
        .strip()
    )
    try:
        translated = json.loads(clean)
    except json.JSONDecodeError:
        raise HTTPException(500, "Translation returned invalid JSON")

    return TranslateResponse(translated=translated)