"""
rubrics.py
POST /api/rubrics/  – professor creates a custom rubric
GET  /api/rubrics/  – list rubrics
GET  /api/rubrics/{id} – retrieve single rubric
"""
from __future__ import annotations
import uuid
from fastapi import APIRouter, HTTPException, status

from app.core.supabase import get_supabase
from app.schemas.grading import RubricCreateRequest

router = APIRouter(prefix="/rubrics", tags=["rubrics"])


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_rubric(payload: RubricCreateRequest):
    total_weight = sum(d.weight for d in payload.dimensions.values())
    if not (0.99 <= total_weight <= 1.01):
        raise HTTPException(
            status_code=400,
            detail=f"Dimension weights must sum to 1.0 (got {total_weight:.3f}).",
        )

    rubric_id = str(uuid.uuid4())
    get_supabase().table("rubrics").insert(
        {
            "id": rubric_id,
            "name": payload.name,
            "grading_mode": payload.grading_mode.value,
            "criteria": {
                dim: cfg.model_dump() for dim, cfg in payload.dimensions.items()
            },
        }
    ).execute()

    return {"rubric_id": rubric_id}


@router.get("/")
async def list_rubrics():
    rows = get_supabase().table("rubrics").select("id, name, grading_mode").execute()
    return rows.data or []


@router.get("/{rubric_id}")
async def get_rubric(rubric_id: str):
    row = (
        get_supabase()
        .table("rubrics")
        .select("*")
        .eq("id", rubric_id)
        .single()
        .execute()
    )
    if not row.data:
        raise HTTPException(status_code=404, detail="Rubric not found.")
    return row.data
