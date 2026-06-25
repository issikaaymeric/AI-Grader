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
import os
import threading
import uuid
from typing import Annotated

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile, status

from app.core.cache import cache_get
from app.core.dependencies import CurrentUser, get_client_ip
from app.core.supabase import get_supabase
from app.schemas.grading import AssignmentStatusResponse, GradingSystem
from app.services.auth.audit import log_event
from app.services.ingestion.extractor import (
    ExtractionResult,
    append_image_descriptions,
    describe_images,
    extract,
)
from pydantic import BaseModel

router = APIRouter(prefix="/assignments", tags=["assignments"])

MAX_FILE_BYTES = 20 * 1024 * 1024
MAX_INSTRUCTIONS_CHARS = 2000 * 5  # 10k chars, ~4k words, ~20-25 pages of text


class AssignmentSummary(BaseModel):
    """Lightweight row for list views — no full feedback payload."""
    id: str
    subject: str
    grading_system: str
    status: str
    grade: str | None = None
    flagged_for_review: bool = False
    created_at: str


class AssignmentListResponse(BaseModel):
    items: list[AssignmentSummary]
    total: int
    limit: int
    offset: int


# ── Grading dispatch ──────────────────────────────────────────────────────────

def _describe_and_finalize_text(extraction: ExtractionResult) -> str:
    """
    Describe any extracted images via Mistral vision and fold the
    descriptions into the submission text. Safe to call with no images
    (no-op) or with no MISTRAL_API_KEY set (images just get skipped,
    grading proceeds on text alone).
    """
    if extraction.images and os.environ.get("MISTRAL_API_KEY"):
        try:
            describe_images(extraction.images)
            append_image_descriptions(extraction)
        except Exception:
            import logging
            logging.getLogger(__name__).exception(
                "Image description failed; continuing with text-only grading."
            )
    return extraction.text


def _grade_in_thread(
    assignment_id: str,
    extraction: ExtractionResult,
    subject: str,
    grading_system: str,
    rubric_dict: dict | None,
    instructions: str | None,
) -> None:
    """Run grading synchronously in a background thread (no Celery needed)."""
    def _run():
        from app.schemas.grading import GradingSystem as GS, Rubric
        from app.services.scoring.subject_rubrics import get_rubric_for_subject
        from app.services.scoring.evaluator import evaluate
        from app.core.cache import cache_set
        import logging
        logger = logging.getLogger(__name__)

        # get_supabase() uses threading.local — each thread gets its own client.
        db = get_supabase()
        try:
            db.table("assignments").update({"status": "processing"}).eq(
                "id", assignment_id
            ).execute()

            # Slow Mistral vision calls happen here, off the request path.
            text = _describe_and_finalize_text(extraction)

            # Explicit instructor rubric (rubric_id) always wins. Otherwise,
            # fall back to the per-subject default rubric.
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
    """Try Celery; fall back to thread if Redis/Celery is unavailable."""
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
):
    content = await file.read()

    if len(content) > MAX_FILE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds {MAX_FILE_BYTES // (1024 * 1024)} MB limit.",
        )

    if instructions and len(instructions) > MAX_INSTRUCTIONS_CHARS:
        raise HTTPException(
            status_code=400,
            detail=f"Instructions exceed {MAX_INSTRUCTIONS_CHARS} characters.",
        )

    try:
        # Fast path only: extract text + images, anonymise, but do NOT call
        # Mistral here — that happens later in the background grading task.
        extraction = extract(content, file.filename or "upload.txt")
        from app.services.ingestion.extractor import anonymise
        extraction.text = anonymise(extraction.text)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    assignment_id = str(uuid.uuid4())
    db = get_supabase()

    # Storage upload — non-fatal if bucket not configured
    file_url = None
    try:
        path = f"assignments/{assignment_id}/{file.filename}"
        db.storage.from_("assignments").upload(path, content)
        file_url = db.storage.from_("assignments").get_public_url(path)
    except Exception:
        pass

    # Resolve custom rubric
    rubric_dict: dict | None = None
    if rubric_id:
        row = db.table("rubrics").select("*").eq("id", rubric_id).single().execute()
        if not row.data:
            raise HTTPException(status_code=404, detail="Rubric not found.")
        rubric_dict = row.data.get("criteria")

    # Persist record (instructions stored for audit/re-grade purposes)
    db.table("assignments").insert({
        "id":             assignment_id,
        "user_id":        user.sub,
        "subject":        subject,
        "grading_system": grading_system.value,
        "instructions":   instructions,
        "file_url":       file_url,
        "status":         "pending",
    }).execute()

    # Fire audit log BEFORE dispatching the grading thread — avoids racing
    # on the main-thread Supabase client with the background thread.
    log_event(
        "assignment.submit",
        user_id=user.sub,
        ip_address=get_client_ip(request),
        metadata={
            "assignment_id": assignment_id,
            "subject": subject,
            "system": grading_system.value,
            "has_instructions": bool(instructions),
            "image_count": len(extraction.images),
        },
    )

    # Dispatch grading (Celery or thread fallback). Image description via
    # Mistral happens inside the dispatched task, not here.
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
    """
    List assignments — students see only their own; professors/admins see all.
    Supports basic pagination and an optional status filter.
    """
    limit = max(1, min(limit, 100))
    offset = max(0, offset)

    db = get_supabase()
    query = db.table("assignments").select(
        "id, subject, grading_system, status, grade, flagged_for_review, created_at, user_id",
        count="exact",
    )

    if user.role.value == "student":
        query = query.eq("user_id", user.sub)

    if status_filter:
        query = query.eq("status", status_filter)

    query = query.order("created_at", desc=True).range(offset, offset + limit - 1)

    res = query.execute()
    rows = res.data or []
    total = res.count or len(rows)

    items = [
        AssignmentSummary(
            id=r["id"],
            subject=r["subject"],
            grading_system=r["grading_system"],
            status=r["status"],
            grade=r.get("grade"),
            flagged_for_review=bool(r.get("flagged_for_review")),
            created_at=r["created_at"],
        )
        for r in rows
    ]

    return AssignmentListResponse(items=items, total=total, limit=limit, offset=offset)


@router.get("/{assignment_id}", response_model=AssignmentStatusResponse)
async def get_assignment(assignment_id: str, user: CurrentUser):
    # Cache-first
    cached = cache_get(f"result:{assignment_id}")
    if cached:
        if user.role.value == "student":
            row = get_supabase().table("assignments").select("user_id").eq(
                "id", assignment_id
            ).single().execute()
            if row.data and row.data["user_id"] != user.sub:
                raise HTTPException(status_code=403, detail="Access denied.")
        return AssignmentStatusResponse(id=assignment_id, status="done", result=cached)

    row = (
        get_supabase()
        .table("assignments")
        .select("id, user_id, status, grade, feedback_json, flagged_for_review")
        .eq("id", assignment_id)
        .single()
        .execute()
    )

    if not row.data:
        raise HTTPException(status_code=404, detail="Assignment not found.")

    data = row.data
    if user.role.value == "student" and data["user_id"] != user.sub:
        raise HTTPException(status_code=403, detail="Access denied.")

    result = None
    if data["status"] == "done" and data.get("feedback_json"):
        raw = data["feedback_json"]
        result = json.loads(raw) if isinstance(raw, str) else raw

    return AssignmentStatusResponse(
        id=assignment_id,
        status=data["status"],
        result=result,
    )


@router.delete("/{assignment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_assignment(assignment_id: str, user: CurrentUser):
    """Delete an assignment (only owner or admin can delete)"""
    db = get_supabase()

    # Fetch to check ownership
    row = db.table("assignments").select("user_id").eq("id", assignment_id).single().execute()

    if not row.data:
        raise HTTPException(status_code=404, detail="Assignment not found.")

    if user.role.value == "student" and row.data["user_id"] != user.sub:
        raise HTTPException(status_code=403, detail="Access denied.")

    # Hard delete
    db.table("assignments").delete().eq("id", assignment_id).execute()

    # Also try to clean up storage (non-critical)
    try:
        db.storage.from_("assignments").remove([f"assignments/{assignment_id}"])
    except Exception:
        pass

    return None  # 204 No Content