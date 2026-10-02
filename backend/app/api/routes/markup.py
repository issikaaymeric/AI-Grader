from __future__ import annotations

import json
import logging
import re
import threading
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Query, status
from fastapi.concurrency import run_in_threadpool

from app.core.dependencies import CurrentUser
from app.core.supabase import get_supabase
from app.schemas.markup import ChatMessage, ChatReply, ChatRequest, MarkupResponse
from app.services.markup import chat
from app.services.markup.generator import run_markup_job

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/assignments", tags=["markup"])

STALE_AFTER = timedelta(minutes=10)
HISTORY_LIMIT = 12


# ── Sync helpers (always invoked through run_in_threadpool) ──────────────────

def _get_assignment(assignment_id: str, user) -> dict:
    res = (
        get_supabase()
        .table("assignments")
        .select("id, user_id, subject, instructions, status, file_url, feedback_json")
        .eq("id", assignment_id)
        .limit(1)
        .execute()
    )
    if not res.data:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Assignment not found.")
    row = res.data[0]
    if user.role.value != "admin" and row["user_id"] != user.sub:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Assignment not found.")
    return row


def _result_from_row(row: dict) -> dict | None:
    raw = row.get("feedback_json")
    if not raw:
        return None
    return json.loads(raw) if isinstance(raw, str) else raw


def _get_markup_row(assignment_id: str) -> dict | None:
    res = (
        get_supabase()
        .table("document_markups")
        .select("*")
        .eq("assignment_id", assignment_id)
        .limit(1)
        .execute()
    )
    return res.data[0] if res.data else None


def _parse_ts(value: str) -> datetime:
    value = value.replace("Z", "+00:00")
    # Python < 3.11 requires exactly 3 or 6 fractional digits.
    value = re.sub(r"\.(\d+)", lambda m: "." + m.group(1).ljust(6, "0")[:6], value)
    return datetime.fromisoformat(value)


def _is_stale(row: dict) -> bool:
    try:
        return datetime.now(timezone.utc) - _parse_ts(row["updated_at"]) > STALE_AFTER
    except Exception:
        return True


def _start_or_reuse(assignment_id: str, force: bool) -> dict:
    existing = _get_markup_row(assignment_id)
    if existing:
        if existing["status"] == "processing" and not _is_stale(existing):
            return existing  # a live job already owns this row
        if existing["status"] == "done" and not force:
            return existing

    now = datetime.now(timezone.utc).isoformat()
    fresh = {
        "assignment_id": assignment_id,
        "status": "processing",
        "paragraphs": [],
        "total_chunks": 0,
        "done_chunks": 0,
        "truncated": False,
        "notice": None,
        "updated_at": now,
    }
    saved = (
        get_supabase()
        .table("document_markups")
        .upsert(fresh, on_conflict="assignment_id")
        .execute()
    )
    threading.Thread(
        target=run_markup_job,
        args=(assignment_id,),
        daemon=True,
        name=f"markup-{assignment_id}",
    ).start()
    return saved.data[0] if saved.data else {**fresh, "created_at": now}


def _to_response(row: dict) -> MarkupResponse:
    paragraphs = row.get("paragraphs") or []
    return MarkupResponse(
        assignment_id=row["assignment_id"],
        status=row["status"],
        total_chunks=row.get("total_chunks", 0),
        done_chunks=row.get("done_chunks", 0),
        truncated=bool(row.get("truncated")),
        notice=row.get("notice"),
        change_count=sum(1 for p in paragraphs if p.get("changed")),
        paragraphs=paragraphs,
    )


def _get_history(assignment_id: str, user_id: str, limit: int) -> list[dict]:
    res = (
        get_supabase()
        .table("markup_chat_messages")
        .select("id, role, content, created_at")
        .eq("assignment_id", assignment_id)
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return list(reversed(res.data or []))


def _save_exchange(
    assignment_id: str, user_id: str, question: str, reply: str,
    asked_at: datetime, answered_at: datetime,
) -> tuple[dict, dict]:
    res = (
        get_supabase()
        .table("markup_chat_messages")
        .insert([
            {"assignment_id": assignment_id, "user_id": user_id, "role": "user",
             "content": question, "created_at": asked_at.isoformat()},
            {"assignment_id": assignment_id, "user_id": user_id, "role": "assistant",
             "content": reply, "created_at": answered_at.isoformat()},
        ])
        .execute()
    )
    by_role = {r["role"]: r for r in (res.data or [])}
    if "user" not in by_role or "assistant" not in by_role:
        raise RuntimeError("Failed to persist chat messages.")
    return by_role["user"], by_role["assistant"]


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/{assignment_id}/markup", response_model=MarkupResponse,
             status_code=status.HTTP_202_ACCEPTED)
async def start_markup(assignment_id: str, user: CurrentUser, force: bool = Query(False)):
    """Idempotent: returns the existing markup, or starts generation."""
    assignment = await run_in_threadpool(_get_assignment, assignment_id, user)
    if assignment["status"] != "done":
        raise HTTPException(status.HTTP_409_CONFLICT,
                            "Grading must finish before a marked-up document is available.")
    if not assignment.get("file_url"):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                            "The original file was not stored for this assignment.")
    row = await run_in_threadpool(_start_or_reuse, assignment_id, force)
    return _to_response(row)


@router.get("/{assignment_id}/markup", response_model=MarkupResponse)
async def get_markup(assignment_id: str, user: CurrentUser):
    await run_in_threadpool(_get_assignment, assignment_id, user)
    row = await run_in_threadpool(_get_markup_row, assignment_id)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Markup has not been generated yet.")
    return _to_response(row)


@router.get("/{assignment_id}/markup/chat", response_model=list[ChatMessage])
async def get_chat(assignment_id: str, user: CurrentUser):
    await run_in_threadpool(_get_assignment, assignment_id, user)
    rows = await run_in_threadpool(_get_history, assignment_id, user.sub, 100)
    return [ChatMessage(**r) for r in rows]


@router.post("/{assignment_id}/markup/chat", response_model=ChatReply)
async def post_chat(assignment_id: str, body: ChatRequest, user: CurrentUser):
    assignment = await run_in_threadpool(_get_assignment, assignment_id, user)
    markup = await run_in_threadpool(_get_markup_row, assignment_id)
    if not markup or not markup.get("paragraphs"):
        raise HTTPException(status.HTTP_409_CONFLICT, "The marked-up document is not ready yet.")

    paragraphs: list[dict] = markup["paragraphs"]
    history = await run_in_threadpool(_get_history, assignment_id, user.sub, HISTORY_LIMIT)
    system = chat.build_system_prompt(assignment, _result_from_row(assignment), paragraphs)

    focus = None
    if body.paragraph_index is not None:
        focus = next((p for p in paragraphs if p["index"] == body.paragraph_index), None)

    asked_at = datetime.now(timezone.utc)
    try:
        reply = await run_in_threadpool(
            chat.answer,
            system,
            [{"role": m["role"], "content": m["content"]} for m in history],
            body.message,
            focus,
        )
    except Exception:
        logger.exception("Markup chat failed for %s", assignment_id)
        raise HTTPException(status.HTTP_502_BAD_GATEWAY,
                            "The assistant is unavailable. Please try again.")

    user_row, assistant_row = await run_in_threadpool(
        _save_exchange, assignment_id, user.sub, body.message, reply,
        asked_at, datetime.now(timezone.utc),
    )
    return ChatReply(user_message=ChatMessage(**user_row),
                     assistant_message=ChatMessage(**assistant_row))
