"""
ingestion.py
Extract plain text from PDF / DOCX / TXT and anonymise student identifiers.
"""
from __future__ import annotations

import io
import re
from pathlib import Path


# ── Extraction ──────────────────────────────────────────────────────────────

def extract_text(file_bytes: bytes, filename: str) -> str:
    suffix = Path(filename).suffix.lower()
    if suffix == ".pdf":
        return _extract_pdf(file_bytes)
    elif suffix in (".docx", ".doc"):
        return _extract_docx(file_bytes)
    elif suffix == ".txt":
        return file_bytes.decode("utf-8", errors="replace")
    else:
        raise ValueError(f"Unsupported file type: {suffix}")


def _extract_pdf(data: bytes) -> str:
    import PyPDF2  # lazy import – not needed for DOCX path

    reader = PyPDF2.PdfReader(io.BytesIO(data))
    pages: list[str] = []
    for page in reader.pages:
        text = page.extract_text()
        if text:
            pages.append(text)
    return "\n".join(pages)


def _extract_docx(data: bytes) -> str:
    from docx import Document  # lazy import

    doc = Document(io.BytesIO(data))
    return "\n".join(p.text for p in doc.paragraphs if p.text.strip())


# ── Anonymisation ───────────────────────────────────────────────────────────

_STUDENT_ID_RE = re.compile(r"\b[A-Z]{1,3}\d{5,10}\b")          # e.g. STU00123
_NAME_HEADER_RE = re.compile(
    r"(?im)^(student|name|author|submitted by)[:\s]+.+$"
)
_EMAIL_RE = re.compile(r"\b[\w.+-]+@[\w-]+\.[a-z]{2,}\b", re.IGNORECASE)


def anonymise(text: str) -> str:
    """
    Remove common student identifiers so the LLM cannot be influenced
    by name-based bias.
    """
    text = _STUDENT_ID_RE.sub("[STUDENT_ID]", text)
    text = _NAME_HEADER_RE.sub("[NAME REDACTED]", text)
    text = _EMAIL_RE.sub("[EMAIL REDACTED]", text)
    return text


def prepare_submission(file_bytes: bytes, filename: str) -> str:
    raw = extract_text(file_bytes, filename)
    return anonymise(raw)
