import re
from typing import Iterable

PROMPT_INJECTION_PATTERNS: tuple[str, ...] = (
    r"ignore\s+(?:previous|all|prior|system|developer|assistant)\s+instructions?",
    r"override\s+(?:system|developer|assistant|teacher|rubric|grading)\s+instructions?",
    r"system\s*:\s*you\s+are\s+now",
    r"developer\s+message",
    r"act\s+as\s+if\s+you\s+are",
    r"disregard\s+(?:the|all)\s+rules?",
    r"you\s+are\s+an\s+unrestricted\s+assistant",
    r"ignore\s+this\s+instruction",
    r"bypass\s+(?:safety|policy|rubric|grading)",
    r"give\s+(?:this|the)\s+student\s+(?:an?|the)\s+\w+\+?",
    r"reward\s+this\s+submission",
    r"penalize\s+this\s+submission",
    r"output\s+only\s+the\s+final\s+grade",
)

SENSITIVE_PATTERNS: tuple[tuple[str, str], ...] = (
    (r"(?i)api[_-]?key\s*[:=]\s*[A-Za-z0-9_\-]{8,}", "[API_KEY REDACTED]"),
    (r"(?i)secret\s*[:=]\s*[A-Za-z0-9_\-]{8,}", "[SECRET REDACTED]"),
    (r"(?i)token\s*[:=]\s*[A-Za-z0-9_\-]{8,}", "[TOKEN REDACTED]"),
    (r"(?i)password\s*[:=]\s*[^\s]+", "[PASSWORD REDACTED]"),
    (r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", "[EMAIL REDACTED]"),
    (r"\b\d{10,}\b", "[PHONE REDACTED]"),
)


def _compile_patterns(patterns: Iterable[str]) -> list[re.Pattern[str]]:
    compiled: list[re.Pattern[str]] = []
    for pattern in patterns:
        compiled.append(re.compile(pattern, flags=re.IGNORECASE | re.DOTALL | re.MULTILINE))
    return compiled


PROMPT_PATTERNS = _compile_patterns(PROMPT_INJECTION_PATTERNS)
SENSITIVE_REGEXES = [
    (re.compile(pattern, flags=re.IGNORECASE | re.DOTALL | re.MULTILINE), replacement)
    for pattern, replacement in SENSITIVE_PATTERNS
]


def sanitize_submission_text(text: str) -> str:
    """Remove prompt-injection triggers and obvious credentials from grading input."""
    if not text:
        return ""

    sanitized = text
    for pattern, replacement in SENSITIVE_REGEXES:
        sanitized = pattern.sub(replacement, sanitized)

    for pattern in PROMPT_PATTERNS:
        sanitized = pattern.sub(" ", sanitized)

    sanitized = re.sub(r"(?i)(?:ignore|disregard|override)\s+(?:all|previous|prior|system|developer|assistant)\s+(?:instructions?|rules?)", " ", sanitized)
    sanitized = re.sub(r"[\r\n]+", "\n", sanitized)
    sanitized = re.sub(r"\s{3,}", " ", sanitized)
    sanitized = re.sub(r"\n{3,}", "\n\n", sanitized)
    sanitized = sanitized.strip()
    return sanitized


def sanitize_submission_payload(payload: dict) -> dict:
    """Sanitize dictionary-like submission metadata before it reaches the grading engine."""
    cleaned = dict(payload)
    for key, value in cleaned.items():
        if isinstance(value, str):
            cleaned[key] = sanitize_submission_text(value)
    return cleaned


def detect_prompt_injection(text: str) -> bool:
    if not text:
        return False
    return any(pattern.search(text) for pattern in PROMPT_PATTERNS)


def redact_sensitive_fields(text: str) -> str:
    redacted = text
    for pattern, replacement in SENSITIVE_PATTERNS:
        redacted = re.sub(pattern, replacement, redacted, flags=re.IGNORECASE | re.DOTALL | re.MULTILINE)
    return redacted


__all__ = [
    "sanitize_submission_text",
    "sanitize_submission_payload",
    "detect_prompt_injection",
    "redact_sensitive_fields",
]
