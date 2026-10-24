"""Authenticated grading analytics scoped to the requesting user's records."""
from __future__ import annotations

from fastapi import APIRouter
from fastapi.concurrency import run_in_threadpool

from app.core.dependencies import CurrentUser
from app.core.supabase import get_supabase

router = APIRouter(prefix="/analytics", tags=["analytics"])


def _load_analytics(user_id: str) -> dict:
    """Aggregate only the signed-in user's submissions."""
    response = (
        get_supabase()
        .table("assignments")
        .select("grading_system, grade, flagged_for_review, created_at")
        .eq("user_id", user_id)
        .execute()
    )
    rows = response.data or []

    distribution: dict[str, dict[str, int]] = {}
    flagged_count = 0
    for row in rows:
        system = row.get("grading_system") or "Unknown"
        grade = row.get("grade") or "Pending"
        distribution.setdefault(system, {})
        distribution[system][grade] = distribution[system].get(grade, 0) + 1
        if row.get("flagged_for_review"):
            flagged_count += 1

    return {
        "total_assignments": len(rows),
        "flagged_for_review": flagged_count,
        "grade_distribution": distribution,
    }


@router.get("/")
async def get_analytics(user: CurrentUser):
    """Return the authenticated user's grading distribution."""
    return await run_in_threadpool(_load_analytics, user.sub)
