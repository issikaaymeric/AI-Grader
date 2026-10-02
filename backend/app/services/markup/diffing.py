from __future__ import annotations

import re
from difflib import SequenceMatcher

_TOKEN_RE = re.compile(r"\s+|\w+|[^\w\s]", re.UNICODE)
_WORD_RE = re.compile(r"\w+", re.UNICODE)


def word_similarity(a: str, b: str) -> float:
    """0..1 similarity over words only; used to reject wholesale rewrites."""
    wa, wb = _WORD_RE.findall(a.lower()), _WORD_RE.findall(b.lower())
    if not wa and not wb:
        return 1.0
    return SequenceMatcher(None, wa, wb, autojunk=False).ratio()


def diff_segments(original: str, corrected: str) -> list[dict[str, str]]:
    """
    Token-level diff. Invariants:
      "".join(equal + delete) == original
      "".join(equal + insert) == corrected
    """
    a, b = _TOKEN_RE.findall(original), _TOKEN_RE.findall(corrected)
    out: list[dict[str, str]] = []

    def push(kind: str, text: str) -> None:
        if not text:
            return
        if out and out[-1]["type"] == kind:
            out[-1]["text"] += text
        else:
            out.append({"type": kind, "text": text})

    for tag, i1, i2, j1, j2 in SequenceMatcher(None, a, b, autojunk=False).get_opcodes():
        if tag == "equal":
            push("equal", "".join(a[i1:i2]))
        else:
            push("delete", "".join(a[i1:i2]))
            push("insert", "".join(b[j1:j2]))
    return out
