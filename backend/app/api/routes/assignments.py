"""
assignments.py — with sync fallback when Celery/Redis is unavailable
"""
from __future__ import annotations

import json
import threading
import uuid
from typing import Annotated

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile, status

from app.core.cache import cache_get
from app.core.dependencies import CurrentUser, get_client_ip
from app.core.supabase import get_supabase
from app.schemas.grading import AssignmentStatusResponse, GradingSystem
from app.services.auth.audit import log_event
from app.services.ingestion.extractor import prepare_submission

router = APIRouter(prefix="/assignments", tags=["assignments"])

MAX_FILE_BYTES = 20 * 1024 * 1024


# ── Grading dispatch ──────────────────────────────────────────────────────────

def _grade_in_thread(
    assignment_id: str,
    text: str,
    subject: str,
    grading_system: str,
    rubric_dict: dict | None,
) -> None:
    """Run grading synchronously in a background thread (no Celery needed)."""
    def _run():
        from app.schemas.grading import GradingSystem as GS, Rubric
        from app.services.scoring.default_rubric import DEFAULT_RUBRIC
        from app.services.scoring.evaluator import evaluate
        from app.core.cache import cache_set
        import logging
        logger = logging.getLogger(__name__)

        db = get_supabase()
        try:
            db.table("assignments").update({"status": "processing"}).eq(
                "id", assignment_id
            ).execute()

            rubric = Rubric(**rubric_dict) if rubric_dict else DEFAULT_RUBRIC
            result = evaluate(
                submission_text=text,
                subject=subject,
                grading_system=GS(grading_system),
                rubric=rubric,
                assignment_id=assignment_id,
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


def _dispatch(assignment_id, text, subject, grading_system, rubric_dict):
    """Try Celery; fall back to thread if Redis/Celery is unavailable."""
    try:
        from app.services.multi_process.tasks import grade_assignment
        grade_assignment.delay(
            assignment_id=assignment_id,
            submission_text=text,
            subject=subject,
            grading_system=grading_system,
            rubric_dict=rubric_dict,
        )
    except Exception:
        _grade_in_thread(assignment_id, text, subject, grading_system, rubric_dict)


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/", status_code=status.HTTP_202_ACCEPTED)
async def submit_assignment(
    request: Request,
    user: CurrentUser,
    file: Annotated[UploadFile, File()],
    subject: Annotated[str, Form()],
    grading_system: Annotated[GradingSystem, Form()],
    rubric_id: Annotated[str | None, Form()] = None,
):
    content = await file.read()

    if len(content) > MAX_FILE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds {MAX_FILE_BYTES // (1024 * 1024)} MB limit.",
        )

    try:
        text = prepare_submission(content, file.filename or "upload.txt")
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

    # Persist record
    db.table("assignments").insert({
        "id":             assignment_id,
        "user_id":        user.sub,
        "subject":        subject,
        "grading_system": grading_system.value,
        "file_url":       file_url,
        "status":         "pending",
    }).execute()

    # Dispatch grading (Celery or thread fallback)
    _dispatch(assignment_id, text, subject, grading_system.value, rubric_dict)

    log_event(
        "assignment.submit",
        user_id=user.sub,
        ip_address=get_client_ip(request),
        metadata={"assignment_id": assignment_id, "subject": subject,
                  "system": grading_system.value},
    )

    return {"assignment_id": assignment_id, "status": "pending"}


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