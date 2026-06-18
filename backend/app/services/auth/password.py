from passlib.context import CryptContext

_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")

_MAX_BCRYPT_BYTES = 72


def _to_bcrypt_safe(plain: str) -> str:
    """Bcrypt only uses the first 72 bytes of input. Encode to UTF-8 and
    truncate at the byte level (not char level, since multi-byte chars
    could otherwise be split or silently dropped)."""
    encoded = plain.encode("utf-8")
    if len(encoded) <= _MAX_BCRYPT_BYTES:
        return plain
    return encoded[:_MAX_BCRYPT_BYTES].decode("utf-8", errors="ignore")


def hash_password(plain: str) -> str:
    return _ctx.hash(_to_bcrypt_safe(plain))


def verify_password(plain: str, hashed: str) -> bool:
    return _ctx.verify(_to_bcrypt_safe(plain), hashed)