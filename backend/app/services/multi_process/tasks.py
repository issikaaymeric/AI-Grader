"""
tasks.py
Celery async task definitions.  The grading pipeline runs here so the API
returns immediately and the client polls for results.
"""
from __future__ import annotations

import logging

from celery import Celery

from app.core.config import settings
from app.core.cache import cache_set
from app.core.supabase import get_supabase

logger = logging.getLogger(__name__)

celery_app = Celery(
    "ai_grader",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
)
celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    task_track_started=True,
    task_acks_late=True,         # Retry on worker crash
    worker_prefetch_multiplier=1,
)


@celery_app.task(
    bind=True,
    max_retries=3,
    default_retry_delay=5,
    name="tasks.grade_assignment",
)
def grade_assignment(
    self,
    assignment_id: str,
    submission_text: str,
    subject: str,
    grading_system: str,
    rubric_dict: dict | None,
) -> dict:
    """
    Heavy lifting happens here, off the request thread.
    Stores result in Supabase + Valkey cache on success.
    """
    from app.schemas.grading import GradingSystem, Rubric
    from app.services.scoring.default_rubric import DEFAULT_RUBRIC
    from app.services.scoring.evaluator import evaluate

    try:
        db = get_supabase()
        db.table("assignments").update({"status": "processing"}).eq("id", assignment_id).execute()

        rubric = Rubric(**rubric_dict) if rubric_dict else DEFAULT_RUBRIC
        system = GradingSystem(grading_system)

        result = evaluate(
            submission_text=submission_text,
            subject=subject,
            grading_system=system,
            rubric=rubric,
            assignment_id=assignment_id,
        )

        result_dict = result.model_dump()

        # Persist to Supabase
        db.table("assignments").update(
            {
                "status": "done",
                "grade": result.letter_grade,
                "feedback_json": result.model_dump_json(),
                "swot_analysis": result.swot.model_dump_json(),
                "flagged_for_review": result.flag_for_review,
            }
        ).eq("id", assignment_id).execute()

        # Cache for fast retrieval
        cache_set(f"result:{assignment_id}", result_dict)

        return result_dict

    except Exception as exc:
        logger.exception("grade_assignment failed for %s: %s", assignment_id, exc)
        get_supabase().table("assignments").update(
            {"status": "error"}
        ).eq("id", assignment_id).execute()
        raise self.retry(exc=exc)
