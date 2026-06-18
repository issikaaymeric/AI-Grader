"""
analytics.py
GET /api/analytics/  – grading distribution for professors.
Stub for Phase 3; returns aggregated stats from Supabase.
"""
from fastapi import APIRouter
from app.core.supabase import get_supabase

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/")
async def get_analytics():
    db = get_supabase()

    rows = (
        db.table("assignments")
        .select("grading_system, grade, flagged_for_review, created_at")
        .execute()
    )

    data = rows.data or []

    # Grade distribution
    distribution: dict[str, dict[str, int]] = {}
    flagged_count = 0

    for row in data:
        system = row["grading_system"]
        grade = row.get("grade") or "Pending"
        distribution.setdefault(system, {})
        distribution[system][grade] = distribution[system].get(grade, 0) + 1
        if row.get("flagged_for_review"):
            flagged_count += 1

    return {
        "total_assignments": len(data),
        "flagged_for_review": flagged_count,
        "grade_distribution": distribution,
    }
