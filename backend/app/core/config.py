from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List
import dotenv

dotenv.load_dotenv()

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # App
    APP_NAME: str = "AI Grader"
    DEBUG: bool = False
    SECRET_KEY: str = ""

    # Supabase
    SUPABASE_URL: str
    SUPABASE_SECRET_KEY: str
    SUPABASE_SERVICE_ROLE_KEY: str

    # LLM API Keys (pool for redundancy)
    GEMINI_API_KEY_1: str = ""
    GEMINI_API_KEY_2: str = ""
    GEMINI_API_KEY_3: str = ""
    GEMINI_API_KEY_4: str = ""
    DEEPSEEK_API_KEY: str = ""
    PRIMARY_LLM_PROVIDER: str = "gemini"  # "gemini" 

    # Valkey / Redis
    VALKEY_URL: str = "redis://localhost:6379/0"
    CACHE_TTL_SECONDS: int = 3600

    # Celery
    CELERY_BROKER_URL: str = "redis://localhost:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/2"

    # Auth
    AUTH_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 48  # 2 days


settings = Settings()
