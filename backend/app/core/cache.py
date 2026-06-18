import json
import valkey
from app.core.config import settings

_pool: valkey.ConnectionPool | None = None


def _get_client() -> valkey.Valkey:
    global _pool
    if _pool is None:
        _pool = valkey.ConnectionPool.from_url(settings.VALKEY_URL, decode_responses=True)
    return valkey.Valkey(connection_pool=_pool)


def cache_get(key: str) -> dict | None:
    client = _get_client()
    try:
        raw = client.get(key)
        return json.loads(raw) if raw else None
    except Exception:
        return None


def cache_set(key: str, value: dict, ttl: int = settings.CACHE_TTL_SECONDS) -> None:
    client = _get_client()
    try:
        client.setex(key, ttl, json.dumps(value))
    except Exception:
        pass  # Cache failures must never break the main flow


def cache_delete(key: str) -> None:
    client = _get_client()
    try:
        client.delete(key)
    except Exception:
        pass
