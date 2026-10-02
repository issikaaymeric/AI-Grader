"""
assignments.py — with sync fallback when Celery/Redis is unavailable.
Accepts free-text `instructions` from the instructor so the grader can
evaluate against the actual assignment brief. Also extracts embedded
images at upload time and describes them via Mistral vision *inside*
the background grading task, so the (slow) vision calls never block
the upload response.
"""
from __future__ import annotations

import json
import logging
import os
import threading
import uuid
from typing import Annotated

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

from app.core.cache import cache_get
from app.core.dependencies import CurrentUser, get_client_ip
from app.core.supabase import get_supabase
from app.schemas.grading import AssignmentStatusResponse, GradingSystem
from app.services.auth.audit import log_event
from app.services.ingestion.extractor import (
    ExtractionResult,
    anonymise,
    append_image_descriptions,
    describe_images,
    extract,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/assignments", tags=["assignments"])

STORAGE_BUCKET = "assignments"
MAX_FILE_BYTES = 20 * 1024 * 1024
MAX_INSTRUCTIONS_CHARS = 2000 * 5  # 10k chars, ~4k words, ~20-25 pages of text
MAX_INSTRUCTIONS_FILE_BYTES = 5 * 1024 * 1024


class AssignmentSummary(BaseModel):
    """Lightweight row for list views — includes score and result for analytics."""
    id: str
    subject: str
    grading_system: str
    status: str
    grade: str | None = None
    score: float | None = None
    result: dict | None = None
    flagged_for_review: bool = False
    created_at: str


class AssignmentListResponse(BaseModel):
    items: list[AssignmentSummary]
    total: int
    limit: int
    offset: int


# ── Storage ───────────────────────────────────────────────────────────────────

def _upload_original(assignment_id: str, content: bytes, filename: str, content_type: str | None) -> str | None:
    """
    Store the original upload under an ASCII-safe key and return its public URL.
    Never raises: grading does not depend on the stored file, but the marked-up
    document view does, so failures are logged with a full traceback.
    """
    ext = os.path.splitext(filename or "")[1].lower()
    path = f"assignments/{assignment_id}/original{ext}"
    try:
        bucket = get_supabase().storage.from_(STORAGE_BUCKET)
        bucket.upload(
            path,
            content,
            {
                "content-type": content_type or "application/octet-stream",
                "upsert": "true",
            },
        )
        return bucket.get_public_url(path)
    except Exception:
        logger.exception("Original file upload failed for assignment %s (path=%s)", assignment_id, path)
        return None


def _remove_original(assignment_id: str) -> None:
    try:
        bucket = get_supabase().storage.from_(STORAGE_BUCKET)
        folder = f"assignments/{assignment_id}"
        names = [f["name"] for f in (bucket.list(folder) or []) if f.get("name")]
        if names:
            bucket.remove([f"{folder}/{n}" for n in names])
    except Exception:
        logger.exception("Storage cleanup failed for assignment %s", assignment_id)


# ── Grading dispatch ──────────────────────────────────────────────────────────

def _describe_and_finalize_text(extraction: ExtractionResult) -> str:
    if extraction.images and os.environ.get("MISTRAL_API_KEY"):
        try:
            describe_images(extraction.images)
            append_image_descriptions(extraction)
        except Exception:
            logger.exception("Image description failed; continuing with text-only grading.")
    return extraction.text


def _grade_in_thread(
    assignment_id: str,
    extraction: ExtractionResult,
    subject: str,
    grading_system: str,
    rubric_dict: dict | None,
    instructions: str | None,
) -> None:
    def _run():
        from app.schemas.grading import GradingSystem as GS, Rubric
        from app.services.scoring.subject_rubrics import get_rubric_for_subject
        from app.services.scoring.evaluator import evaluate
        from app.core.cache import cache_set

        db = get_supabase()
        try:
            db.table("assignments").update({"status": "processing"}).eq(
                "id", assignment_id
            ).execute()

            text = _describe_and_finalize_text(extraction)

            rubric = Rubric(**rubric_dict) if rubric_dict else get_rubric_for_subject(subject)
            result = evaluate(
                submission_text=text,
                subject=subject,
                grading_system=GS(grading_system),
                rubric=rubric,
                assignment_id=assignment_id,
                instructions=instructions,
            )

            db.table("assignments").update({
                "status": "done",
                "grade": result.letter_grade,
                "score": result.raw_score,
                "feedback_json": result.model_dump_json(),
                "swot_analysis": result.swot.model_dump_json(),
                "flagged_for_review": result.flag_for_review,
            }).eq("id", assignment_id).execute()

            cache_set(f"result:{assignment_id}", result.model_dump())

        except Exception as exc:
            logger.exception("Grading failed for %s: %s", assignment_id, exc)
            db.table("assignments").update({"status": "error"}).eq(
                "id", assignment_id
            ).execute()

    threading.Thread(target=_run, daemon=True).start()


def _dispatch(assignment_id, extraction, subject, grading_system, rubric_dict, instructions):
    try:
        from app.services.multi_process.tasks import grade_assignment
        grade_assignment.delay(
            assignment_id=assignment_id,
            submission_text=extraction.text,
            images=extraction.images,
            subject=subject,
            grading_system=grading_system,
            rubric_dict=rubric_dict,
            instructions=instructions,
        )
    except Exception:
        _grade_in_thread(
            assignment_id, extraction, subject, grading_system, rubric_dict, instructions
        )

def _extract_brief(content: bytes, filename: str) -> str:
    """Text of an uploaded assignment brief. Images are ignored. Blocking."""
    return (extract(content, filename).text or "").strip()


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/", status_code=status.HTTP_202_ACCEPTED)
async def submit_assignment(
    request: Request,
    user: CurrentUser,
    file: Annotated[UploadFile, File()],
    subject: Annotated[str, Form()],
    grading_system: Annotated[GradingSystem, Form()],
    instructions: Annotated[str | None, Form()] = None,
    rubric_id: Annotated[str | None, Form()] = None,
    instructions_file: Annotated[UploadFile | None, File()] = None,
):
    content = await file.read()

    if len(content) > MAX_FILE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds {MAX_FILE_BYTES // (1024 * 1024)} MB limit.",
        )

    # ── Assignment brief: typed text and/or an attached file, merged ─────────
    brief_text = ""
    brief_name = ""
    if instructions_file is not None and instructions_file.filename:
        brief_bytes = await instructions_file.read()
        if len(brief_bytes) > MAX_INSTRUCTIONS_FILE_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"Instructions file exceeds {MAX_INSTRUCTIONS_FILE_BYTES // (1024 * 1024)} MB limit.",
            )
        brief_name = os.path.basename(instructions_file.filename)
        try:
            brief_text = await run_in_threadpool(_extract_brief, brief_bytes, brief_name)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=f"Instructions file: {exc}") from exc
        except Exception as exc:
            logger.exception("Could not read instructions file %s", brief_name)
            raise HTTPException(
                status_code=400, detail="Instructions file could not be read."
            ) from exc
        if not brief_text:
            raise HTTPException(
                status_code=400,
                detail="Instructions file contains no readable text (scanned PDFs are not supported).",
            )

    parts: list[str] = []
    typed = (instructions or "").strip()
    if typed:
        parts.append(typed)
    if brief_text:
        parts.append(f"[Attached brief: {brief_name}]\n{brief_text}")
    instructions = "\n\n".join(parts) or None

    if instructions and len(instructions) > MAX_INSTRUCTIONS_CHARS:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Instructions exceed {MAX_INSTRUCTIONS_CHARS} characters "
                f"(typed text and attached file combined)."
            ),
        )

    # ── Submission ───────────────────────────────────────────────────────────
    try:
        extraction = extract(content, file.filename or "upload.txt")
        extraction.text = anonymise(extraction.text)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    assignment_id = str(uuid.uuid4())
    db = get_supabase()

    file_url = await run_in_threadpool(
        _upload_original, assignment_id, content, file.filename or "", file.content_type
    )

    rubric_dict: dict | None = None
    if rubric_id:
        row = db.table("rubrics").select("*").eq("id", rubric_id).limit(1).execute()
        if not row.data:
            raise HTTPException(status_code=404, detail="Rubric not found.")
        rubric_dict = row.data[0].get("criteria")

    db.table("assignments").insert({
        "id":             assignment_id,
        "user_id":        user.sub,
        "subject":        subject,
        "grading_system": grading_system.value,
        "instructions":   instructions,
        "rubric_id":      rubric_id,
        "file_url":       file_url,
        "status":         "pending",
    }).execute()

    log_event(
        "assignment.submit",
        user_id=user.sub,
        ip_address=get_client_ip(request),
        metadata={
            "assignment_id": assignment_id,
            "subject": subject,
            "system": grading_system.value,
            "has_instructions": bool(instructions),
            "has_instructions_file": bool(brief_text),
            "image_count": len(extraction.images),
            "original_stored": file_url is not None,
        },
    )

    _dispatch(
        assignment_id, extraction, subject, grading_system.value, rubric_dict, instructions
    )

    return {"assignment_id": assignment_id, "status": "pending"}


@router.get("/", response_model=AssignmentListResponse)
async def list_assignments(
    user: CurrentUser,
    status_filter: str | None = None,
    limit: int = 20,
    offset: int = 0,
):
    limit = max(1, min(limit, 100))
    offset = max(0, offset)

    db = get_supabase()
    query = db.table("assignments").select(
        "id, subject, grading_system, status, grade, score, feedback_json, flagged_for_review, created_at, user_id",
        count="exact",
    )

    if user.role.value != "admin":
        query = query.eq("user_id", user.sub)

    if status_filter:
        query = query.eq("status", status_filter)

    query = query.order("created_at", desc=True).range(offset, offset + limit - 1)
    res = query.execute()
    rows = res.data or []
    total = res.count or len(rows)

    items = [
        AssignmentSummary(
            id=r["id"], subject=r["subject"], grading_system=r["grading_system"],
            status=r["status"], grade=r.get("grade"), score=r.get("score"),
            result=json.loads(r["feedback_json"]) if r.get("feedback_json") else None,
            flagged_for_review=bool(r.get("flagged_for_review")), created_at=r["created_at"],
        )
        for r in rows
    ]
    return AssignmentListResponse(items=items, total=total, limit=limit, offset=offset)


@router.get("/{assignment_id}", response_model=AssignmentStatusResponse)
async def get_assignment(assignment_id: str, user: CurrentUser):
    res = (
        get_supabase()
        .table("assignments")
        .select(
            "id, user_id, status, grade, score, feedback_json, "
            "flagged_for_review, subject, grading_system, instructions, rubric_id"
        )
        .eq("id", assignment_id)
        .limit(1)
        .execute()
    )

    if not res.data:
        raise HTTPException(status_code=404, detail="Assignment not found.")

    data = res.data[0]
    if user.role.value != "admin" and data["user_id"] != user.sub:
        raise HTTPException(status_code=404, detail="Assignment not found.")

    cached = cache_get(f"result:{assignment_id}")
    if cached:
        result = cached
        effective_status = "done"
    elif data["status"] == "done" and data.get("feedback_json"):
        raw = data["feedback_json"]
        result = json.loads(raw) if isinstance(raw, str) else raw
        effective_status = data["status"]
    else:
        result = None
        effective_status = data["status"]

    return AssignmentStatusResponse(
        id=assignment_id,
        status=effective_status,
        result=result,
        subject=data.get("subject"),
        grading_system=data.get("grading_system"),
        instructions=data.get("instructions"),
        rubric_id=data.get("rubric_id"),
    )


@router.delete("/{assignment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_assignment(assignment_id: str, user: CurrentUser):
    db = get_supabase()

    res = db.table("assignments").select("user_id").eq("id", assignment_id).limit(1).execute()

    if not res.data:
        raise HTTPException(status_code=404, detail="Assignment not found.")

    if user.role.value != "admin" and res.data[0]["user_id"] != user.sub:
        raise HTTPException(status_code=404, detail="Assignment not found.")

    db.table("assignments").delete().eq("id", assignment_id).execute()
    await run_in_threadpool(_remove_original, assignment_id)

    return None
