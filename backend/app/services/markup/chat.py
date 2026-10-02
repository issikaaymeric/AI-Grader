from __future__ import annotations

from typing import Any

from app.services.markup import llm

EDITS_BUDGET = 12_000
EXCERPT_BUDGET = 8_000


def _clip(text: str, limit: int) -> str:
    text = text or ""
    return text if len(text) <= limit else text[: limit - 1] + "…"


def _grading_context(result: dict | None) -> str:
    if not result:
        return "No grading result is available."
    lines = [
        f"Grade: {result.get('letter_grade')} "
        f"({result.get('raw_score')}/100, {result.get('grading_system')} system)",
        f"Summary: {result.get('summary', '')}",
    ]
    for dim, data in (result.get("dimension_scores") or {}).items():
        lines.append(f"- {dim}: {data.get('score')}/100. {_clip(data.get('chain_of_thought', ''), 400)}")
    steps = result.get("next_steps") or []
    if steps:
        lines.append("Next steps: " + " | ".join(steps[:5]))
    return "\n".join(lines)


def _edits_context(paragraphs: list[dict]) -> str:
    lines: list[str] = []
    used = 0
    for p in paragraphs:
        if not p.get("changed"):
            continue
        entry = (
            f"[P{p['index']}] ({p.get('category')}) {p.get('reason') or ''}\n"
            f"  BEFORE: {_clip(p['original'], 600)}\n"
            f"  AFTER:  {_clip(p['corrected'], 600)}"
        )
        if used + len(entry) > EDITS_BUDGET:
            lines.append("(further edits omitted for length)")
            break
        lines.append(entry)
        used += len(entry)
    return "\n".join(lines) or "No corrections were made."


def _excerpt(paragraphs: list[dict]) -> str:
    out: list[str] = []
    used = 0
    for p in paragraphs:
        line = f"[P{p['index']}] {p['original']}"
        if used + len(line) > EXCERPT_BUDGET:
            out.append("(document truncated for length)")
            break
        out.append(line)
        used += len(line)
    return "\n".join(out)


def build_system_prompt(assignment: dict, result: dict | None, paragraphs: list[dict]) -> str:
    return (
        "You are a teaching assistant helping a student understand the feedback and "
        "corrections on their submitted assignment. Corrections appear as tracked changes: "
        "BEFORE is the student's text, AFTER is the suggested text.\n\n"
        "Guidelines:\n"
        "- Ground every answer in the grading result, corrections and document below. "
        "If the answer is not supported by them, say so.\n"
        "- Explain why a change was suggested and the underlying rule or principle. "
        "Refer to paragraphs as P<number>.\n"
        "- You may rewrite a single sentence as an illustration. Do not write whole sections "
        "for the student.\n"
        "- You cannot change the grade. If the student disputes it, explain the rubric reasoning "
        "and suggest raising it with their instructor.\n"
        "- Be concise. Reply in the language the student writes in.\n\n"
        f"SUBJECT: {assignment.get('subject')}\n\n"
        f"GRADING RESULT:\n{_grading_context(result)}\n\n"
        f"CORRECTIONS:\n{_edits_context(paragraphs)}\n\n"
        f"DOCUMENT:\n{_excerpt(paragraphs)}"
    )


def answer(
    system: str,
    history: list[dict[str, str]],
    user_message: str,
    focus: dict[str, Any] | None = None,
) -> str:
    content = user_message
    if focus:
        change = (
            f"BEFORE: {_clip(focus['original'], 800)}\nAFTER: {_clip(focus['corrected'], 800)}\n"
            f"Reason: {focus.get('reason') or 'n/a'}"
            if focus.get("changed")
            else f"TEXT: {_clip(focus['original'], 800)}\n(no change was suggested)"
        )
        content = f"[The student is asking about P{focus['index']}]\n{change}\n\nQuestion: {user_message}"
    return llm.complete_text(system, [*history, {"role": "user", "content": content}])
