"""
main.py – FastAPI application entry point.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.assignments import router as assignments_router
from app.api.routes.rubrics import router as rubrics_router
from app.api.routes.analytics import router as analytics_router
from app.api.routes.auth import router as auth_router
from app.api.routes.translate import translate

from app.core.config import settings

app = FastAPI(
    title=settings.APP_NAME,
    description="Rubric-agnostic AI assignment grader with US/UK support.",
    version="1.0.0",
    redirect_slashes=False,
)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "https://ai-grader-bu8f19sw4-issika-aymeric-kouames-projects.vercel.app",
        "https://ai-grader-ashen.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(auth_router, prefix="/api", tags=["auth"])
app.include_router(assignments_router, prefix="/api", tags=["assignments"])
app.include_router(rubrics_router, prefix="/api", tags=["rubrics"])
app.include_router(analytics_router, prefix="/api", tags=["analytics"])
app.include_router(translate.router, prefix="/api", tags=["translate"])

# ── Health ────────────────────────────────────────────────────────────────────
@app.get("/health", tags=["ops"])
async def health():
    """Liveness probe — Render / Docker healthcheck target."""
    return {"status": "ok", "service": settings.APP_NAME}