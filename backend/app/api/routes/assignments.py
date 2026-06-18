"""
assignments.py
POST /api/assignments/  – upload file + trigger async grading
GET  /api/assignments/{id} – poll for results
"""
from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status

from app.core.cache import cache_get
from app.core.supabase import get_supabase
from app.schemas.grading import AssignmentStatusResponse, GradingSystem
from app.services.ingestion.extractor import prepare_submission
from app.services.multi_process.tasks import grade_assignment

router = APIRouter(prefix="/assignments", tags=["assignments"])

MAX_FILE_BYTES = 20 * 1024 * 1024  # 20 MB hard limit


@router.post("/", status_code=status.HTTP_202_ACCEPTED)
async def submit_assignment(
    file: Annotated[UploadFile, File(description="PDF, DOCX, or TXT")],
    subject: Annotated[str, Form()],
    grading_system: Annotated[GradingSystem, Form()],
    rubric_id: Annotated[str | None, Form()] = None,
):
    """
    Upload an assignment for async grading.
    Returns 202 immediately; client should poll GET /assignments/{id}.
    """
    content = await file.read()
    if len(content) > MAX_FILE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds {MAX_FILE_BYTES // (1024*1024)} MB limit.",
        )

    # Extract + anonymise text
    try:
        text = prepare_submission(content, file.filename or "upload.txt")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    assignment_id = str(uuid.uuid4())
    db = get_supabase()

    # Upload raw file to Supabase Storage
    storage_path = f"assignments/{assignment_id}/{file.filename}"
    db.storage.from_("assignments").upload(storage_path, content)
    file_url = db.storage.from_("assignments").get_public_url(storage_path)

    # Resolve rubric dict (None → evaluator will use default)
    rubric_dict: dict | None = None
    if rubric_id:
        row = db.table("rubrics").select("*").eq("id", rubric_id).single().execute()
        if not row.data:
            raise HTTPException(status_code=404, detail="Rubric not found.")
        rubric_dict = row.data.get("criteria")

    # Persist assignment record
    db.table("assignments").insert(
        {
            "id": assignment_id,
            "subject": subject,
            "grading_system": grading_system.value,
            "file_url": file_url,
            "status": "pending",
        }
    ).execute()

    # Dispatch async task
    grade_assignment.delay(
        assignment_id=assignment_id,
        submission_text=text,
        subject=subject,
        grading_system=grading_system.value,
        rubric_dict=rubric_dict,
    )

    return {"assignment_id": assignment_id, "status": "pending"}


@router.get("/{assignment_id}", response_model=AssignmentStatusResponse)
async def get_assignment(assignment_id: str):
    """Poll grading status and retrieve results once done."""

    # 1. Try cache first (avoids DB round-trip on hot path)
    cached = cache_get(f"result:{assignment_id}")
    if cached:
        return AssignmentStatusResponse(
            id=assignment_id,
            status="done",
            result=cached,
        )

    # 2. Fall back to Supabase
    row = (
        get_supabase()
        .table("assignments")
        .select("id, status, grade, feedback_json, flagged_for_review")
        .eq("id", assignment_id)
        .single()
        .execute()
    )

    if not row.data:
        raise HTTPException(status_code=404, detail="Assignment not found.")

    data = row.data
    result = None
    if data["status"] == "done" and data.get("feedback_json"):
        import json
        result = json.loads(data["feedback_json"])

    return AssignmentStatusResponse(
        id=assignment_id,
        status=data["status"],
        result=result,
    )
