"""
ingestion.py
Extract plain text (and images) from PDF / DOCX / TXT and anonymise student identifiers.
Images are described using Mistral's vision model.
"""
from __future__ import annotations
import io
import os
import re
import base64
from pathlib import Path
from dataclasses import dataclass, field


# ── Data model ───────────────────────────────────────────────────────────────

@dataclass
class ExtractionResult:
    text: str
    images: list[dict] = field(default_factory=list)
    # images entries:
    # {
    #   "data": "<base64>", "mime_type": "image/png",
    #   "page": int|None, "width": int, "height": int,
    #   "description": str,   # populated by describe_images()
    # }


# ── Mistral vision ────────────────────────────────────────────────────────────

DEFAULT_MISTRAL_MODEL = "mistral-vision-latest"


def describe_images(
    images: list[dict],
    *,
    api_key: str | None = None,
    model: str = DEFAULT_MISTRAL_MODEL,
    prompt: str = (
        "You are an academic grading assistant. Describe this image concisely "
        "in terms of its academic content: charts, diagrams, tables, figures, "
        "equations, or illustrations. Focus on information relevant to grading."
    ),
) -> list[dict]:
    """
    Call Mistral's vision API via raw httpx — no SDK client needed.

    `api_key` falls back to the MISTRAL_API_KEY environment variable if not
    provided explicitly. Raises ValueError if no key can be resolved.
    """
    import httpx

    resolved_key = api_key or os.environ.get("MISTRAL_API_KEY")
    if not resolved_key:
        raise ValueError(
            "No Mistral API key provided and MISTRAL_API_KEY is not set in "
            "the environment."
        )

    for img in images:
        data_url = f"data:{img['mime_type']};base64,{img['data']}"
        payload = {
            "model": model,
            "messages": [{
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": data_url}},
                    {"type": "text", "text": prompt},
                ],
            }],
        }
        try:
            response = httpx.post(
                "https://api.mistral.ai/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {resolved_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
                timeout=60,
            )
            response.raise_for_status()
            img["description"] = (
                response.json()["choices"][0]["message"]["content"].strip()
            )
        except Exception as exc:
            img["description"] = f"[Image description unavailable: {exc}]"

    return images


# ── Extraction ────────────────────────────────────────────────────────────────

def extract_text(file_bytes: bytes, filename: str) -> str:
    """Backwards-compatible: returns plain text only."""
    return extract(file_bytes, filename).text


def extract(file_bytes: bytes, filename: str) -> ExtractionResult:
    """Full extraction: text + embedded images (no vision description yet)."""
    suffix = Path(filename).suffix.lower().strip()
    if suffix == ".pdf":
        return _extract_pdf(file_bytes)
    elif suffix in (".docx", ".doc"):
        return _extract_docx(file_bytes)
    elif suffix in (".txt", ".text"):
        return ExtractionResult(text=file_bytes.decode("utf-8", errors="replace"))
    else:
        raise ValueError(
            f"Unsupported file type '{suffix or '(no extension)'}' for file "
            f"'{filename}'. Supported types: PDF (.pdf), Word (.docx, .doc), "
            f"plain text (.txt)."
        )


def _extract_pdf(data: bytes) -> ExtractionResult:
    import PyPDF2
    try:
        import fitz  # PyMuPDF
        _HAS_FITZ = True
    except ImportError:
        _HAS_FITZ = False

    reader = PyPDF2.PdfReader(io.BytesIO(data))
    pages: list[str] = []
    for page in reader.pages:
        text = page.extract_text()
        if text:
            pages.append(text)
    text = "\n".join(pages)

    images: list[dict] = []

    if _HAS_FITZ:
        doc = fitz.open(stream=data, filetype="pdf")
        for page_num, page in enumerate(doc, start=1):
            for img in page.get_images(full=True):
                xref = img[0]
                try:
                    pix_data = doc.extract_image(xref)
                    raw = pix_data["image"]
                    ext = pix_data["ext"]

                    # Re-encode exotic formats (JPEG2000, JBIG2, CMYK) as PNG
                    if ext not in ("jpeg", "jpg", "png", "gif", "webp", "bmp"):
                        pix = fitz.Pixmap(doc, xref)
                        if pix.colorspace and pix.colorspace.n > 3:
                            pix = fitz.Pixmap(fitz.csRGB, pix)  # CMYK → RGB
                        raw = pix.tobytes("png")
                        ext = "png"
                        pix = None

                    w, h = pix_data.get("width", 0), pix_data.get("height", 0)
                    if w < 32 or h < 32:
                        continue

                    images.append({
                        "data": base64.b64encode(raw).decode(),
                        "mime_type": f"image/{ext}",
                        "page": page_num,
                        "width": w,
                        "height": h,
                        "description": "",
                    })
                except Exception:
                    continue
        doc.close()

    else:
        # PyPDF2 fallback
        for page_num, page in enumerate(reader.pages, start=1):
            resources = page.get("/Resources")
            if not resources:
                continue
            xobjects = resources.get("/XObject")
            if not xobjects:
                continue
            for _, obj_ref in xobjects.items():
                obj = obj_ref.get_object()
                if obj.get("/Subtype") != "/Image":
                    continue
                w = int(obj.get("/Width", 0))
                h = int(obj.get("/Height", 0))
                if w < 32 or h < 32:
                    continue
                try:
                    raw = obj.get_data()
                    filter_ = obj.get("/Filter", "")
                    mime = "image/jpeg" if filter_ in ("/DCTDecode", ["/DCTDecode"]) else "image/png"
                    images.append({
                        "data": base64.b64encode(raw).decode(),
                        "mime_type": mime,
                        "page": page_num,
                        "width": w,
                        "height": h,
                        "description": "",
                    })
                except Exception:
                    continue

    return ExtractionResult(text=text, images=images)


def _extract_docx(data: bytes) -> ExtractionResult:
    from docx import Document

    doc = Document(io.BytesIO(data))
    text = "\n".join(p.text for p in doc.paragraphs if p.text.strip())

    images: list[dict] = []
    seen: set[str] = set()

    MIME_MAP = {
        "jpg": "image/jpeg", "jpeg": "image/jpeg",
        "png": "image/png",  "gif": "image/gif",
        "bmp": "image/bmp",  "tiff": "image/tiff",
        "webp": "image/webp",
    }

    def _dimensions(blob: bytes, ext: str) -> tuple[int, int]:
        try:
            if ext == "png" and blob[:8] == b"\x89PNG\r\n\x1a\n":
                import struct
                w, h = struct.unpack(">II", blob[16:24])
                return w, h
            if ext in ("jpg", "jpeg") and blob[:2] == b"\xff\xd8":
                import struct
                i = 2
                while i < len(blob):
                    if blob[i] != 0xFF:
                        break
                    marker = blob[i + 1]
                    if marker in (0xC0, 0xC1, 0xC2):
                        h, w = struct.unpack(">HH", blob[i + 5:i + 9])
                        return w, h
                    seg_len = struct.unpack(">H", blob[i + 2:i + 4])[0]
                    i += 2 + seg_len
            try:
                from PIL import Image as PILImage
                img = PILImage.open(io.BytesIO(blob))
                w, h = img.size
                img.close()
                return w, h
            except Exception:
                return 999, 999
        except Exception:
            return 999, 999

    for part in doc.part.package.iter_parts():
        for rel in part.rels.values():
            if "image" not in rel.reltype.lower():
                continue
            try:
                img_part = rel.target_part
            except Exception:
                continue
            if img_part.partname in seen:
                continue
            seen.add(img_part.partname)

            ext = Path(img_part.partname).suffix.lstrip(".").lower() or "png"
            if ext in ("emf", "wmf", "svg"):
                continue

            mime = MIME_MAP.get(ext, f"image/{ext}")
            blob = img_part.blob

            w, h = _dimensions(blob, ext)
            if w < 32 or h < 32:
                continue

            images.append({
                "data": base64.b64encode(blob).decode(),
                "mime_type": mime,
                "page": None,
                "width": w,
                "height": h,
                "description": "",
            })

    return ExtractionResult(text=text, images=images)


# ── Anonymisation ─────────────────────────────────────────────────────────────

_STUDENT_ID_RE = re.compile(r"\b[A-Z]{1,3}\d{5,10}\b")
_NAME_HEADER_RE = re.compile(r"(?im)^(student|name|author|submitted by)[:\s]+.+$")
_EMAIL_RE = re.compile(r"\b[\w.+-]+@[\w-]+\.[a-z]{2,}\b", re.IGNORECASE)


def anonymise(text: str) -> str:
    """Remove common student identifiers to prevent name-based bias."""
    text = _STUDENT_ID_RE.sub("[STUDENT_ID]", text)
    text = _NAME_HEADER_RE.sub("[NAME REDACTED]", text)
    text = _EMAIL_RE.sub("[EMAIL REDACTED]", text)
    return text


# ── Public entry points ───────────────────────────────────────────────────────

def prepare_submission(file_bytes: bytes, filename: str) -> str:
    """Backwards-compatible — returns anonymised text only."""
    return anonymise(extract_text(file_bytes, filename))


def prepare_submission_full(
    file_bytes: bytes,
    filename: str,
    *,
    mistral_api_key: str | None = None,
    mistral_model: str = DEFAULT_MISTRAL_MODEL,
    describe: bool = True,
) -> ExtractionResult:
    """
    Full entry point — anonymised text + extracted images.

    If `describe` is True (default), each image is described via Mistral's
    vision model and the description is stored under image['description'],
    then appended to `result.text` so text-only graders benefit too.
    `mistral_api_key` falls back to the MISTRAL_API_KEY environment variable.

    Set `describe=False` to skip the (slow) Mistral calls — useful when you
    only want fast text + image *extraction* up front and plan to describe
    the images later (e.g. in a background job).
    """
    result = extract(file_bytes, filename)
    result.text = anonymise(result.text)

    if describe and result.images:
        resolved_key = mistral_api_key or os.environ.get("MISTRAL_API_KEY")
        if resolved_key:
            describe_images(
                result.images,
                api_key=resolved_key,
                model=mistral_model,
            )
            append_image_descriptions(result)

    return result


def append_image_descriptions(result: ExtractionResult) -> ExtractionResult:
    """
    Append each image's `description` to `result.text` as a labeled block.
    Call this after `describe_images()` if you extracted images separately
    (e.g. via `extract()` directly, then described them in a background task).
    """
    if not result.images:
        return result

    image_text_blocks = []
    for i, img in enumerate(result.images, start=1):
        loc = f"page {img['page']}" if img.get("page") else "document"
        desc = img.get("description") or "(no description)"
        image_text_blocks.append(f"[Image {i} — {loc}]: {desc}")

    if image_text_blocks:
        result.text += "\n\n--- Embedded Images ---\n" + "\n".join(image_text_blocks)

    return result