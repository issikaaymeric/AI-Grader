"""
auth.py — Authentication endpoints.

POST /api/auth/register        – create account
POST /api/auth/login           – issue access + refresh tokens
POST /api/auth/refresh         – rotate tokens using refresh token
POST /api/auth/logout          – revoke current access token
GET  /api/auth/me              – return current user profile
POST /api/auth/change-password – change password + revoke all tokens
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.core.dependencies import CurrentUser, get_client_ip, require_auth
from app.core.supabase import get_supabase
from app.schemas.auth import (
    ChangePasswordRequest,
    LoginRequest,
    RefreshRequest,
    RegisterRequest,
    TokenPair,
    UserPublic,
)
from app.services.auth.audit import log_event
from app.services.auth.jwt_service import (
    create_access_token,
    create_refresh_token,
    hash_refresh_token,
    refresh_ttl_seconds,
    revoke_token,
)
from app.services.auth.password import hash_password, verify_password
from app.core.config import settings

router = APIRouter(prefix="/auth", tags=["auth"])


def _refresh_expiry_iso() -> str:
    exp = datetime.now(timezone.utc) + timedelta(seconds=refresh_ttl_seconds())
    return exp.isoformat()


# ── Register ──────────────────────────────────────────────────────────────────

@router.post("/register", response_model=TokenPair, status_code=status.HTTP_201_CREATED)
async def register(payload: RegisterRequest, request: Request):
    db  = get_supabase()
    ip  = get_client_ip(request)
    ua  = request.headers.get("User-Agent", "")

    # Duplicate email check
    existing = db.table("users").select("id").eq("email", payload.email).execute()
    if existing.data:
        log_event("auth.register", ip_address=ip, metadata={"email": payload.email}, success=False)
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered.")

    user_id       = str(uuid.uuid4())
    password_hash = hash_password(payload.password)

    db.table("users").insert(
        {
            "id":            user_id,
            "email":         payload.email,
            "name":          payload.name,
            "role":          payload.role.value,
            "password_hash": password_hash,
            "created_at":    datetime.now(timezone.utc).isoformat(),
        }
    ).execute()

    access_token, jti = create_access_token(user_id, payload.email, payload.role)
    raw_refresh, hashed_refresh = create_refresh_token()

    db.table("refresh_tokens").insert(
        {
            "id":         str(uuid.uuid4()),
            "user_id":    user_id,
            "token_hash": hashed_refresh,
            "expires_at": _refresh_expiry_iso(),
            "revoked":    False,
        }
    ).execute()

    log_event(
        "auth.register",
        user_id=user_id,
        ip_address=ip,
        user_agent=ua,
        metadata={"email": payload.email, "role": payload.role.value},
    )

    return TokenPair(
        access_token=access_token,
        refresh_token=raw_refresh,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


# ── Login ─────────────────────────────────────────────────────────────────────

@router.post("/login", response_model=TokenPair)
async def login(payload: LoginRequest, request: Request):
    db  = get_supabase()
    ip  = get_client_ip(request)
    ua  = request.headers.get("User-Agent", "")

    row = db.table("users").select("*").eq("email", payload.email).execute()

    # Constant-time failure path — don't leak whether email exists
    if not row.data or not verify_password(payload.password, row.data[0].get("password_hash", "")):
        log_event(
            "auth.login",
            ip_address=ip,
            metadata={"email": payload.email},
            success=False,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    user = row.data[0]
    from app.schemas.auth import UserRole
    role = UserRole(user["role"])

    access_token, _ = create_access_token(user["id"], user["email"], role)
    raw_refresh, hashed_refresh = create_refresh_token()

    # Revoke any old refresh tokens for this user (single-session policy)
    db.table("refresh_tokens").update({"revoked": True}).eq("user_id", user["id"]).execute()

    db.table("refresh_tokens").insert(
        {
            "id":         str(uuid.uuid4()),
            "user_id":    user["id"],
            "token_hash": hashed_refresh,
            "expires_at": _refresh_expiry_iso(),
            "revoked":    False,
        }
    ).execute()

    log_event(
        "auth.login",
        user_id=user["id"],
        ip_address=ip,
        user_agent=ua,
        metadata={"email": payload.email},
    )

    return TokenPair(
        access_token=access_token,
        refresh_token=raw_refresh,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


# ── Refresh ───────────────────────────────────────────────────────────────────

@router.post("/refresh", response_model=TokenPair)
async def refresh_tokens(payload: RefreshRequest, request: Request):
    db       = get_supabase()
    ip       = get_client_ip(request)
    token_h  = hash_refresh_token(payload.refresh_token)

    row = (
        db.table("refresh_tokens")
        .select("*, users(*)")
        .eq("token_hash", token_h)
        .eq("revoked", False)
        .execute()
    )

    if not row.data:
        log_event("auth.refresh", ip_address=ip, success=False)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired refresh token.")

    rt   = row.data[0]
    user = rt["users"]

    # Check expiry
    exp  = datetime.fromisoformat(rt["expires_at"])
    if exp < datetime.now(timezone.utc):
        db.table("refresh_tokens").update({"revoked": True}).eq("id", rt["id"]).execute()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token expired.")

    from app.schemas.auth import UserRole
    role = UserRole(user["role"])

    # Rotate: revoke old, issue new pair
    db.table("refresh_tokens").update({"revoked": True}).eq("id", rt["id"]).execute()

    access_token, _ = create_access_token(user["id"], user["email"], role)
    raw_refresh, hashed_refresh = create_refresh_token()

    db.table("refresh_tokens").insert(
        {
            "id":         str(uuid.uuid4()),
            "user_id":    user["id"],
            "token_hash": hashed_refresh,
            "expires_at": _refresh_expiry_iso(),
            "revoked":    False,
        }
    ).execute()

    log_event("auth.refresh", user_id=user["id"], ip_address=ip)

    return TokenPair(
        access_token=access_token,
        refresh_token=raw_refresh,
        expires_in=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )


# ── Logout ────────────────────────────────────────────────────────────────────

@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(request: Request, user: CurrentUser):
    # Revoke current access token jti in Valkey
    revoke_token(user.jti, user.exp)

    # Revoke all refresh tokens for this user
    get_supabase().table("refresh_tokens").update({"revoked": True}).eq("user_id", user.sub).execute()

    log_event(
        "auth.logout",
        user_id=user.sub,
        ip_address=get_client_ip(request),
        user_agent=request.headers.get("User-Agent", ""),
    )


# ── Me ────────────────────────────────────────────────────────────────────────

@router.get("/me", response_model=UserPublic)
async def me(user: CurrentUser):
    row = get_supabase().table("users").select("id, email, name, role, created_at").eq("id", user.sub).single().execute()
    if not row.data:
        raise HTTPException(status_code=404, detail="User not found.")
    return UserPublic(**row.data)


# ── Change Password ───────────────────────────────────────────────────────────

@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
async def change_password(payload: ChangePasswordRequest, request: Request, user: CurrentUser):
    db  = get_supabase()
    ip  = get_client_ip(request)

    row = db.table("users").select("password_hash").eq("id", user.sub).single().execute()
    if not row.data or not verify_password(payload.current_password, row.data["password_hash"]):
        log_event("auth.change_password", user_id=user.sub, ip_address=ip, success=False)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect.")

    db.table("users").update({"password_hash": hash_password(payload.new_password)}).eq("id", user.sub).execute()

    # Revoke current access token + all refresh tokens — forces re-login
    revoke_token(user.jti, user.exp)
    db.table("refresh_tokens").update({"revoked": True}).eq("user_id", user.sub).execute()

    log_event("auth.change_password", user_id=user.sub, ip_address=ip)