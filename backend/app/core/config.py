from pydantic_settings import BaseSettings, SettingsConfigDict
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

    # # ── LLM provider pools (tried in this order) ──────────────────────────────
    # # 1. Gemini — primary, free-tier key pool × model fallback chain
    # GEMINI_API_KEY_1: str = ""
    # GEMINI_API_KEY_2: str = ""
    # GEMINI_API_KEY_3: str = ""
    # GEMINI_API_KEY_4: str = ""
    
    GROQ_API_KEY: str = ""

    # 2. DeepSeek — OpenAI-compatible
    DEEPSEEK_API_KEY: str = ""

    # 3. NVIDIA NIM — OpenAI-compatible, hosts Llama/Qwen/Mistral chat models
    NVIDIA_API_KEY: str = ""

    # 4. Mistral — native API, key pool
    MISTRAL_API_KEY: str = ""
    MISTRAL_API_KEY_2: str = ""

    # 5. GitHub Models — Azure AI Inference-compatible marketplace
    GITHUB_MICROSOFT_MODEL_API_KEY: str = ""

    PRIMARY_LLM_PROVIDER: str = "gemini"

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