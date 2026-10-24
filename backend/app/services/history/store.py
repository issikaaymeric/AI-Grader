from __future__ import annotations

import json
from pathlib import Path
from typing import Any

BASE_DIR = Path(__file__).resolve().parents[2]
HISTORY_PATH = BASE_DIR / "data" / "grading_history.json"


def _ensure_file() -> None:
    HISTORY_PATH.parent.mkdir(parents=True, exist_ok=True)
    if not HISTORY_PATH.exists():
        HISTORY_PATH.write_text("[]", encoding="utf-8")


def load_history() -> list[dict[str, Any]]:
    _ensure_file()
    try:
        data = json.loads(HISTORY_PATH.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except json.JSONDecodeError:
        HISTORY_PATH.write_text("[]", encoding="utf-8")
        return []


def save_history_entry(entry: dict[str, Any]) -> dict[str, Any]:
    history = load_history()
    entry = {**entry, "created_at": entry.get("created_at") or __import__("datetime").datetime.utcnow().isoformat()}
    history.insert(0, entry)
    _ensure_file()
    HISTORY_PATH.write_text(json.dumps(history[:100], indent=2), encoding="utf-8")
    return entry


def clear_history() -> None:
    _ensure_file()
    HISTORY_PATH.write_text("[]", encoding="utf-8")

__all__ = ["load_history", "save_history_entry", "clear_history"]
