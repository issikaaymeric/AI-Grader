import threading
from supabase import create_client, Client
from app.core.config import settings

_local = threading.local()


def get_supabase() -> Client:
    if not hasattr(_local, "client"):
        _local.client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)
    return _local.client