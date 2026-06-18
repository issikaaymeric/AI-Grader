from __future__ import annotations
from enum import Enum
from pydantic import BaseModel, EmailStr, Field, field_validator


class UserRole(str, Enum):
    STUDENT   = "student"
    PROFESSOR = "professor"
    ADMIN     = "admin"


# ── Request bodies ────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    name: str     = Field(min_length=1, max_length=120)
    role: UserRole = UserRole.STUDENT

    @field_validator("password")
    @classmethod
    def password_byte_length(cls, v: str) -> str:
        if len(v.encode("utf-8")) > 72:
            raise ValueError("Password must be 72 bytes or fewer (long or non-ASCII passwords may exceed this).")
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


# ── Token responses ───────────────────────────────────────────

class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int          # seconds


class AccessTokenPayload(BaseModel):
    sub: str          # user UUID
    email: str
    role: UserRole
    exp: int          # Unix timestamp
    iat: int
    jti: str          # JWT ID — used for revocation


# ── User public view ──────────────────────────────────────────

class UserPublic(BaseModel):
    id: str
    email: str
    name: str
    role: UserRole
    created_at: str