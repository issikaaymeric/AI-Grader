"""
audit.py  –  Accountability layer.

Every sensitive action is written to the `audit_logs` table:
  - login success / failure
  - logout
  - registration
  - password change
  - assignment submitted / graded
  - rubric created / deleted
  - role change (admin action)

Failures are logged to stderr but never raised — audit must not break the
main request flow.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from app.core.supabase import get_supabase

logger = logging.getLogger(__name__)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def log_event(
    action: str,
    *,
    user_id: str | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
    metadata: dict[str, Any] | None = None,
    success: bool = True,
) -> None:
    """
    Fire-and-forget audit record.  Never raises.

    Parameters
    ----------
    action      : dot-separated verb, e.g. "auth.login", "assignment.submit"
    user_id     : UUID of the acting user (None for unauthenticated attempts)
    ip_address  : caller IP (from X-Forwarded-For or request.client.host)
    user_agent  : browser / SDK identifier
    metadata    : arbitrary extra context (keep small — no raw file bytes)
    success     : False for failed attempts (wrong password, forbidden access…)
    """
    try:
        get_supabase().table("audit_logs").insert(
            {
                "action":     action,
                "user_id":    user_id,
                "ip_address": ip_address,
                "user_agent": user_agent,
                "metadata":   metadata or {},
                "success":    success,
                "created_at": _now_iso(),
            }
        ).execute()
    except Exception as exc:
        # Degrade gracefully — audit failure must never 500 the API
        logger.error("audit log failed [action=%s user=%s]: %s", action, user_id, exc)