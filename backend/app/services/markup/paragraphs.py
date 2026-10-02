from __future__ import annotations

import io
import os
from dataclasses import dataclass

MAX_PARAGRAPHS = 400


@dataclass(frozen=True)
class Paragraph:
    index: int
    text: str
    kind: str = "paragraph"  # "heading" | "paragraph"
    page: int | None = None


def _from_docx(content: bytes) -> list[tuple[str, str, int | None]]:
    from docx import Document

    doc = Document(io.BytesIO(content))
    out: list[tuple[str, str, int | None]] = []
    for p in doc.paragraphs:
        text = p.text.strip()
        if not text:
            continue
        style = (p.style.name if p.style is not None else "") or ""
        kind = "heading" if style.lower().startswith(("heading", "title")) else "paragraph"
        out.append((text, kind, None))
    return out


def _from_pdf(content: bytes) -> list[tuple[str, str, int | None]]:
    import fitz  # PyMuPDF

    out: list[tuple[str, str, int | None]] = []
    with fitz.open(stream=content, filetype="pdf") as pdf:
        for page_no, page in enumerate(pdf, start=1):
            # Block tuple: (x0, y0, x1, y1, text, block_no, block_type); type 0 = text.
            for block in page.get_text("blocks", sort=True):
                if block[6] != 0:
                    continue
                text = " ".join(str(block[4]).split())
                if text:
                    out.append((text, "paragraph", page_no))
    return out


def extract_paragraphs(content: bytes, filename: str) -> tuple[list[Paragraph], bool]:
    """Return (paragraphs, truncated). Raises ValueError for unsupported/empty input."""
    ext = os.path.splitext(filename)[1].lower()
    if ext == ".docx":
        raw = _from_docx(content)
    elif ext == ".pdf":
        raw = _from_pdf(content)
    else:
        raise ValueError(f"Markup supports .docx and .pdf files, not '{ext or 'unknown'}'.")

    if not raw:
        raise ValueError("No extractable text found (scanned PDFs are not supported).")

    truncated = len(raw) > MAX_PARAGRAPHS
    raw = raw[:MAX_PARAGRAPHS]
    return (
        [Paragraph(index=i, text=t, kind=k, page=pg) for i, (t, k, pg) in enumerate(raw)],
        truncated,
    )
