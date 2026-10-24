"""Compatibility entry point for deployments using uvicorn main:app."""
from app.main import app

__all__ = ["app"]
