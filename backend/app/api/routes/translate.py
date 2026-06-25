from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Any
import json

from auth import get_current_user
from llm_client import run_prompt  # your existing LLM waterfall

router = APIRouter(prefix="/api/translate", tags=["translate"])

SUPPORTED_LANGS = {"fr": "French"}

class TranslateRequest(BaseModel):
    content: dict[str, Any]   # the grading result JSON
    target_lang: str           # "fr"

class TranslateResponse(BaseModel):
    translated: dict[str, Any]

@router.post("/grading-result", response_model=TranslateResponse)
async def translate_grading_result(
    body: TranslateRequest,
    current_user=Depends(get_current_user),
):
    if body.target_lang not in SUPPORTED_LANGS:
        raise HTTPException(400, f"Unsupported language: {body.target_lang}")

    lang_name = SUPPORTED_LANGS[body.target_lang]

    prompt = f"""Translate the following grading result JSON into {lang_name}.
Translate only the VALUES of string fields (feedback, comments, suggestions, summaries).
Do NOT translate keys, numeric scores, or structured fields like annotation coordinates.
Return ONLY valid JSON with identical structure.

{json.dumps(body.content, ensure_ascii=False, indent=2)}"""

    raw = await run_prompt(prompt)

    try:
        translated = json.loads(raw.strip().removeprefix("```json").removesuffix("```").strip())
    except json.JSONDecodeError:
        raise HTTPException(500, "Translation returned invalid JSON")

    return TranslateResponse(translated=translated)