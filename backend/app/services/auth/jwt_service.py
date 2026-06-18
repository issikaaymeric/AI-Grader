"""
jwt_service.py

Access tokens  : short-lived (default 60 min), signed HS256.
Refresh tokens : long-lived (default 7 days), stored hash in Supabase.
Revocation     : jti blocklist in Valkey — O(1) lookup on every request.
"""
from __future__ import annotations

import uuid
import hashlib
from datetime import datetime, timezone, timedelta

from jose import JWTError, jwt

from app.core.config import settings
from app.core.cache import cache_set, cache_get
from app.schemas.auth import AccessTokenPayload, UserRole

_ALG = settings.AUTH_ALGORITHM
_ACCESS_TTL  = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60          # seconds
_REFRESH_TTL = 7 * 24 * 3600                                       # 7 days


# ── Issue ─────────────────────────────────────────────────────────────────────

def _now() -> int:
    return int(datetime.now(timezone.utc).timestamp())


def create_access_token(user_id: str, email: str, role: UserRole) -> tuple[str, str]:
    """Returns (encoded_jwt, jti)."""
    jti = str(uuid.uuid4())
    now = _now()
    payload = {
        "sub":   user_id,
        "email": email,
        "role":  role.value,
        "iat":   now,
        "exp":   now + _ACCESS_TTL,
        "jti":   jti,
    }
    token = jwt.encode(payload, settings.SECRET_KEY, algorithm=_ALG)
    return token, jti


def create_refresh_token() -> tuple[str, str]:
    """Returns (raw_token, sha256_hash).  Only the hash is stored server-side."""
    raw   = str(uuid.uuid4())
    hashed = hashlib.sha256(raw.encode()).hexdigest()
    return raw, hashed


# ── Verify ────────────────────────────────────────────────────────────────────

def decode_access_token(token: str) -> AccessTokenPayload:
    """
    Raises JWTError on invalid / expired tokens.
    Raises ValueError if the jti has been revoked.
    """
    try:
        raw = jwt.decode(token, settings.SECRET_KEY, algorithms=[_ALG])
    except JWTError as exc:
        raise exc

    payload = AccessTokenPayload(
        sub=raw["sub"],
        email=raw["email"],
        role=UserRole(raw["role"]),
        exp=raw["exp"],
        iat=raw["iat"],
        jti=raw["jti"],
    )

    if _is_revoked(payload.jti):
        raise ValueError("Token has been revoked.")

    return payload


# ── Revocation (logout / password change) ─────────────────────────────────────

def revoke_token(jti: str, exp: int) -> None:
    """Add jti to Valkey blocklist until the token's natural expiry."""
    ttl = max(1, exp - _now())
    cache_set(f"revoked_jti:{jti}", {"revoked": True}, ttl=ttl)


def _is_revoked(jti: str) -> bool:
    return cache_get(f"revoked_jti:{jti}") is not None


# ── Refresh token helpers ──────────────────────────────────────────────────────

def hash_refresh_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def refresh_ttl_seconds() -> int:
    return _REFRESH_TTL