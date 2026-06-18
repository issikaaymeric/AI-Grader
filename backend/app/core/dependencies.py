"""
dependencies.py

FastAPI dependency injection for authentication and role-based access control.

Usage in a route:
    from app.core.dependencies import require_auth, require_roles

    @router.get("/me")
    async def me(user: CurrentUser = Depends(require_auth)):
        ...

    @router.post("/rubrics/")
    async def create_rubric(user: CurrentUser = Depends(require_roles(["professor", "admin"]))):
        ...
"""
from __future__ import annotations

from functools import lru_cache
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError

from app.schemas.auth import AccessTokenPayload, UserRole
from app.services.auth.jwt_service import decode_access_token

_bearer = HTTPBearer(auto_error=False)


async def _get_token_payload(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> AccessTokenPayload:
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization header.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        payload = decode_access_token(credentials.credentials)
    except ValueError as exc:          # revoked token
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc))
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return payload


# Public type alias used in route signatures
CurrentUser = Annotated[AccessTokenPayload, Depends(_get_token_payload)]

# Convenience alias — identical to CurrentUser but semantically signals "auth required"
require_auth = Depends(_get_token_payload)


def require_roles(allowed: list[str]):
    """
    Factory that returns a FastAPI Depends enforcing role membership.

    Example:
        Depends(require_roles(["professor", "admin"]))
    """
    allowed_set = {UserRole(r) for r in allowed}

    async def _guard(
        user: Annotated[AccessTokenPayload, Depends(_get_token_payload)],
    ) -> AccessTokenPayload:
        if user.role not in allowed_set:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{user.role.value}' is not permitted for this action.",
            )
        return user

    return Depends(_guard)


def get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"