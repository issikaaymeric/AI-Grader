import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.main import app  # FastAPI ASGI app

# Vercel's Python runtime needs this exact handler name for ASGI
handler = app