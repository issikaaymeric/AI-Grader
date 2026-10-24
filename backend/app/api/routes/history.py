"""Authenticated access to a user's previous grading runs."""
from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Query
from fastapi.concurrency import run_in_threadpool

from app.core.dependencies import CurrentUser
from app.core.supabase import get_supabase

router = APIRouter(prefix="/history", tags=["history"])


def _load_history(user_id: str, limit: int, offset: int) -> dict[str, Any]:
    """Fetch only rows owned by the requesting user; never expose other users' work."""
    response = (
        get_supabase()
        .table("assignments")
        .select("id, subject, grading_system, status, grade, score, flagged_for_review, created_at, feedback_json")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
    )
    items = []
    for row in response.data or []:
        item = dict(row)
        raw = item.pop("feedback_json", None)
        if raw:
            try:
                item["result"] = json.loads(raw) if isinstance(raw, str) else raw
            except (json.JSONDecodeError, TypeError):
                item["result"] = None
        else:
            item["result"] = None
        items.append(item)
    return {"items": items, "limit": limit, "offset": offset}


@router.get("/")
async def list_history(
    user: CurrentUser,
    limit: int = Query(default=25, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
):
    """Return paginated grading history for the authenticated user."""
    return await run_in_threadpool(_load_history, user.sub, limit, offset)
