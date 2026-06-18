"""
main.py – FastAPI application factory.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import assignments, rubrics, analytics
from app.core.config import settings

app = FastAPI(
    title=settings.APP_NAME,
    description="Rubric-agnostic AI assignment grader with US/UK support.",
    version="1.0.0",
)

# ── CORS ─────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "https://your-frontend.vercel.app"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(assignments.router, prefix="/api")
app.include_router(rubrics.router, prefix="/api")
app.include_router(analytics.router, prefix="/api")


# ── Health ────────────────────────────────────────────────────────────────────
@app.get("/health", tags=["ops"])
async def health():
    """Liveness probe — Render / Docker healthcheck target."""
    return {"status": "ok", "service": settings.APP_NAME}
