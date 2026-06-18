"""
test_auth.py
Tests for the authentication + authorization layer.
Run: pytest backend/tests/test_auth.py -v
"""
import time
import pytest
from unittest.mock import MagicMock, patch

from app.schemas.auth import UserRole
from app.services.auth.password import hash_password, verify_password
from app.services.auth.jwt_service import (
    create_access_token,
    create_refresh_token,
    decode_access_token,
    hash_refresh_token,
    revoke_token,
)


# ── Password hashing ──────────────────────────────────────────────────────────

class TestPasswordHashing:
    def test_hash_is_not_plaintext(self):
        hashed = hash_password("Secret123")
        assert hashed != "Secret123"
        assert len(hashed) > 20

    def test_verify_correct_password(self):
        hashed = hash_password("MyPass99")
        assert verify_password("MyPass99", hashed) is True

    def test_verify_wrong_password(self):
        hashed = hash_password("MyPass99")
        assert verify_password("WrongPass", hashed) is False

    def test_two_hashes_of_same_password_differ(self):
        # bcrypt salts are random
        h1 = hash_password("same")
        h2 = hash_password("same")
        assert h1 != h2


# ── JWT creation and decode ───────────────────────────────────────────────────

class TestJWTService:
    def _make_token(self, role=UserRole.STUDENT):
        return create_access_token("user-abc", "user@test.com", role)

    def test_create_and_decode(self):
        token, jti = self._make_token()
        payload = decode_access_token(token)
        assert payload.sub   == "user-abc"
        assert payload.email == "user@test.com"
        assert payload.role  == UserRole.STUDENT
        assert payload.jti   == jti

    def test_professor_role_preserved(self):
        token, _ = self._make_token(role=UserRole.PROFESSOR)
        payload = decode_access_token(token)
        assert payload.role == UserRole.PROFESSOR

    def test_invalid_token_raises(self):
        from jose import JWTError
        with pytest.raises(JWTError):
            decode_access_token("not.a.token")

    def test_tampered_token_raises(self):
        from jose import JWTError
        token, _ = self._make_token()
        bad = token[:-5] + "XXXXX"
        with pytest.raises(JWTError):
            decode_access_token(bad)

    def test_revoked_token_raises(self):
        token, jti = self._make_token()
        payload = decode_access_token(token)

        # Mock cache to simulate revoked jti
        with patch("app.services.auth.jwt_service.cache_get", return_value={"revoked": True}):
            with pytest.raises(ValueError, match="revoked"):
                decode_access_token(token)

    def test_jti_is_unique(self):
        _, jti1 = self._make_token()
        _, jti2 = self._make_token()
        assert jti1 != jti2

    def test_refresh_token_hash_is_deterministic(self):
        raw, _ = create_refresh_token()
        assert hash_refresh_token(raw) == hash_refresh_token(raw)

    def test_refresh_token_raw_differs_from_hash(self):
        raw, hashed = create_refresh_token()
        assert raw != hashed


# ── Role-based access control ─────────────────────────────────────────────────

class TestRBAC:
    """
    Tests the require_roles dependency factory.
    We call the inner _guard coroutine directly, passing a fake token payload.
    """

    def _payload(self, role: UserRole):
        from app.schemas.auth import AccessTokenPayload
        return AccessTokenPayload(
            sub="uid", email="u@t.com", role=role,
            exp=int(time.time()) + 3600, iat=int(time.time()), jti="jti-test"
        )

    @pytest.mark.asyncio
    async def test_allowed_role_passes(self):
        from app.core.dependencies import require_roles
        from fastapi import HTTPException

        guard_dep = require_roles(["professor", "admin"])
        # Extract the inner _guard function from the Depends wrapper
        _guard = guard_dep.dependency

        result = await _guard(self._payload(UserRole.PROFESSOR))
        assert result.role == UserRole.PROFESSOR

    @pytest.mark.asyncio
    async def test_disallowed_role_raises_403(self):
        from app.core.dependencies import require_roles
        from fastapi import HTTPException

        guard_dep = require_roles(["professor", "admin"])
        _guard = guard_dep.dependency

        with pytest.raises(HTTPException) as exc_info:
            await _guard(self._payload(UserRole.STUDENT))
        assert exc_info.value.status_code == 403

    @pytest.mark.asyncio
    async def test_admin_passes_all_guards(self):
        from app.core.dependencies import require_roles

        for allowed in [["professor"], ["student"], ["professor", "admin"]]:
            guard_dep = require_roles(allowed + ["admin"])
            _guard = guard_dep.dependency
            result = await _guard(self._payload(UserRole.ADMIN))
            assert result.role == UserRole.ADMIN


# ── Audit logging ─────────────────────────────────────────────────────────────

class TestAuditLogger:
    def test_audit_never_raises_on_db_failure(self):
        """Audit failures must not propagate to callers."""
        with patch("app.services.auth.audit.get_supabase") as mock_db:
            mock_db.side_effect = Exception("DB is down")
            # Should not raise
            from app.services.auth.audit import log_event
            log_event("auth.login", user_id="uid", success=False)

    def test_audit_writes_correct_fields(self):
        with patch("app.services.auth.audit.get_supabase") as mock_db:
            mock_insert = MagicMock()
            mock_db.return_value.table.return_value.insert.return_value.execute = mock_insert

            from app.services.auth.audit import log_event
            log_event("auth.login", user_id="u1", ip_address="1.2.3.4", success=True)

            call_args = mock_db.return_value.table.return_value.insert.call_args[0][0]
            assert call_args["action"]     == "auth.login"
            assert call_args["user_id"]    == "u1"
            assert call_args["ip_address"] == "1.2.3.4"
            assert call_args["success"]    is True