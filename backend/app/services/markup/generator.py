from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, Field, ValidationError

from app.core.supabase import get_supabase
from app.services.markup import llm
from app.services.markup.diffing import diff_segments, word_similarity
from app.services.markup.paragraphs import extract_paragraphs

logger = logging.getLogger(__name__)

STORAGE_BUCKET = "assignments"
CHUNK_SIZE = 12
MIN_SIMILARITY = 0.25          # below this the model rewrote the paragraph; discard
MAX_INSTRUCTIONS_CHARS = 2000
CATEGORIES = {"grammar", "spelling", "punctuation", "clarity", "style", "structure", "accuracy"}


class _Edit(BaseModel):
    index: int
    corrected: str = Field(min_length=1)
    reason: str = ""
    category: str = "clarity"


def _system_prompt(subject: str, instructions: str | None) -> str:
    brief = ""
    if instructions:
        brief = (
            "\nAssignment brief, for context on what each paragraph should accomplish:\n"
            + instructions[:MAX_INSTRUCTIONS_CHARS]
        )
    return (
        f"You are a meticulous copy editor reviewing a student's {subject} assignment.\n"
        "Return ONLY a JSON object, no prose, no code fences:\n"
        '{"edits":[{"index":<int>,"corrected":"<full corrected paragraph>",'
        '"reason":"<one short sentence>",'
        '"category":"<grammar|spelling|punctuation|clarity|style|structure|accuracy>"}]}\n'
        "Rules:\n"
        "- Include only paragraphs with a real error or clearly weak construction. "
        "An empty list is valid.\n"
        "- 'corrected' is the COMPLETE paragraph with minimal edits. Preserve meaning, voice, "
        "language and terminology. Never add new claims, sources or arguments.\n"
        "- Fix factual errors only when certain (category 'accuracy'). Leave quotations untouched.\n"
        "- Never rewrite a paragraph wholesale.\n"
        "- 'reason' is at most 25 words, addressed to the student."
        + brief
    )


def _extract_json(raw: str) -> Any:
    start, end = raw.find("{"), raw.rfind("}")
    if start == -1 or end <= start:
        raise ValueError("No JSON object in LLM response.")
    return json.loads(raw[start : end + 1])


def _parse_edits(raw: str) -> list[_Edit]:
    data = _extract_json(raw)
    items = data.get("edits", []) if isinstance(data, dict) else []
    edits: list[_Edit] = []
    for item in items:
        try:
            edits.append(_Edit.model_validate(item))
        except ValidationError:
            continue  # drop a malformed edit, keep the rest of the batch
    return edits


def _request_edits(subject: str, instructions: str | None, chunk: list[dict]) -> list[_Edit]:
    user = "Paragraphs:\n" + json.dumps(
        [{"index": p["index"], "text": p["original"]} for p in chunk], ensure_ascii=False
    )
    raw = llm.complete(
        _system_prompt(subject, instructions),
        [{"role": "user", "content": user}],
        max_tokens=3000,
        temperature=0.1,
    )
    return _parse_edits(raw)


def _apply_edits(docs: dict[int, dict], allowed: set[int], edits: list[_Edit]) -> int:
    applied = 0
    for edit in edits:
        if edit.index not in allowed:
            continue
        doc = docs[edit.index]
        corrected = edit.corrected.strip()
        if not corrected or corrected == doc["original"]:
            continue
        if word_similarity(doc["original"], corrected) < MIN_SIMILARITY:
            continue
        category = edit.category.strip().lower()
        doc.update(
            corrected=corrected,
            changed=True,
            reason=edit.reason.strip()[:300] or None,
            category=category if category in CATEGORIES else "clarity",
            segments=diff_segments(doc["original"], corrected),
        )
        applied += 1
    return applied


def _persist(assignment_id: str, **fields: Any) -> None:
    fields["updated_at"] = datetime.now(timezone.utc).isoformat()
    get_supabase().table("document_markups").update(fields).eq(
        "assignment_id", assignment_id
    ).execute()


def _download_original(assignment_id: str) -> tuple[str, bytes]:
    bucket = get_supabase().storage.from_(STORAGE_BUCKET)
    folder = f"assignments/{assignment_id}"
    names = [
        f["name"] for f in (bucket.list(folder) or [])
        if f.get("name") and not f["name"].startswith(".")
    ]
    if not names:
        raise FileNotFoundError("The original file is not stored for this assignment.")
    return names[0], bucket.download(f"{folder}/{names[0]}")


def run_markup_job(assignment_id: str) -> None:
    """Blocking; run in a worker thread. Persists progress after every chunk."""
    try:
        res = (
            get_supabase()
            .table("assignments")
            .select("subject, instructions")
            .eq("id", assignment_id)
            .limit(1)
            .execute()
        )
        if not res.data:
            raise LookupError("Assignment not found.")
        subject, instructions = res.data[0]["subject"], res.data[0].get("instructions")

        filename, content = _download_original(assignment_id)
        paragraphs, truncated = extract_paragraphs(content, filename)

        docs = [
            {
                "index": p.index,
                "kind": p.kind,
                "page": p.page,
                "original": p.text,
                "corrected": p.text,
                "changed": False,
                "category": None,
                "reason": None,
                "segments": [{"type": "equal", "text": p.text}],
            }
            for p in paragraphs
        ]
        by_index = {d["index"]: d for d in docs}
        chunks = [docs[i : i + CHUNK_SIZE] for i in range(0, len(docs), CHUNK_SIZE)]

        # The document becomes visible immediately; red marks stream in per chunk.
        _persist(assignment_id, paragraphs=docs, total_chunks=len(chunks),
                 done_chunks=0, truncated=truncated)

        failed = 0
        for n, chunk in enumerate(chunks, start=1):
            try:
                edits = _request_edits(subject, instructions, chunk)
                _apply_edits(by_index, {p["index"] for p in chunk}, edits)
            except Exception:
                failed += 1
                logger.exception("Markup chunk %d/%d failed for %s", n, len(chunks), assignment_id)
            _persist(assignment_id, paragraphs=docs, done_chunks=n)

        if failed == len(chunks):
            _persist(assignment_id, status="error",
                     notice="The reviewer could not process this document. Please try again.")
        else:
            notice = f"{failed} of {len(chunks)} sections could not be reviewed." if failed else None
            _persist(assignment_id, status="done", notice=notice)

    except Exception as exc:
        logger.exception("Markup job failed for %s", assignment_id)
        try:
            _persist(assignment_id, status="error", notice=str(exc)[:300])
        except Exception:
            logger.exception("Could not record markup failure for %s", assignment_id)
