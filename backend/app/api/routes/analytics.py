"""Authenticated grading analytics scoped to the requesting user's records."""
from __future__ import annotations

from collections import Counter
from datetime import datetime

from fastapi import APIRouter
from fastapi.concurrency import run_in_threadpool

from app.core.dependencies import CurrentUser
from app.core.supabase import get_supabase

router = APIRouter(prefix="/analytics", tags=["analytics"])


def _month_key(value: str | None) -> str | None:
    """Normalize an ISO timestamp to YYYY-MM without failing on bad legacy data."""
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return parsed.strftime("%Y-%m")
    except (TypeError, ValueError):
        return None


def _load_analytics(user_id: str) -> dict:
    """Aggregate only the signed-in user's submissions."""
    response = (
        get_supabase()
        .table("assignments")
        .select("grading_system, grade, score, status, flagged_for_review, created_at")
        .eq("user_id", user_id)
        .execute()
    )
    rows = response.data or []

    grade_distribution: dict[str, dict[str, int]] = {}
    status_counts: Counter[str] = Counter()
    monthly_counts: Counter[str] = Counter()
    scores: list[float] = []
    flagged_count = 0
    graded_count = 0

    for row in rows:
        status = str(row.get("status") or "unknown").lower()
        status_counts[status] += 1

        system = str(row.get("grading_system") or "Unknown")
        grade = row.get("grade")
        if grade not in (None, ""):
            grade_label = str(grade)
            grade_distribution.setdefault(system, {})
            grade_distribution[system][grade_label] = (
                grade_distribution[system].get(grade_label, 0) + 1
            )
            graded_count += 1

        raw_score = row.get("score")
        if raw_score is not None:
            try:
                scores.append(float(raw_score))
            except (TypeError, ValueError):
                pass

        month = _month_key(row.get("created_at"))
        if month:
            monthly_counts[month] += 1

        if row.get("flagged_for_review"):
            flagged_count += 1

    # Keep a stable, chronological six-month activity window, including zeroes.
    now = datetime.now()
    months = []
    year, month = now.year, now.month
    for _ in range(5, -1, -1):
        months.append(f"{year:04d}-{month:02d}")
        month -= 1
        if month == 0:
            month, year = 12, year - 1

    return {
        "total_assignments": len(rows),
        "graded_assignments": graded_count,
        "pending_assignments": sum(
            count for status, count in status_counts.items()
            if status in {"pending", "processing", "queued"}
        ),
        "failed_assignments": status_counts.get("error", 0) + status_counts.get("failed", 0),
        "flagged_for_review": flagged_count,
        "scored_assignments": len(scores),
        "average_score": round(sum(scores) / len(scores), 2) if scores else None,
        "grade_distribution": grade_distribution,
        "status_distribution": dict(status_counts),
        "monthly_activity": [
            {"month": key, "count": monthly_counts.get(key, 0)} for key in months
        ],
    }


@router.get("/")
async def get_analytics(user: CurrentUser):
    """Return the authenticated user's grading trends and outcome summaries."""
    return await run_in_threadpool(_load_analytics, user.sub)
