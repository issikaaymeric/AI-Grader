"""
text_annotator.py

Annotates submission text with paragraph and line-level markers so the LLM
can produce precise, location-anchored feedback.

Output format (injected into the prompt):
  [P1, L1]  First sentence of the first paragraph.
  [P1, L2]  Second sentence of the same paragraph.
  [P2, L3]  First sentence of the second paragraph.
  ...
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field


@dataclass
class AnnotatedSubmission:
    annotated_text: str           # Full text with [Pn, Ln] prefixes
    line_count: int
    paragraph_count: int
    line_map: dict[int, tuple[int, int]] = field(default_factory=dict)
    # line_map[global_line_num] -> (paragraph_num, local_line_in_paragraph)


def annotate(raw_text: str) -> AnnotatedSubmission:
    """
    Split into paragraphs (double newline boundary), then into sentences
    within each paragraph. Assign global line numbers sequentially.

    Sentence splitting is intentionally simple: split on '. ', '! ', '? '
    so we don't pull in an NLP dependency. Swap for spaCy/NLTK if you want
    more accurate sentence boundary detection.
    """
    # Normalize line endings, collapse 3+ blank lines into 2
    text = re.sub(r"\r\n", "\n", raw_text)
    text = re.sub(r"\n{3,}", "\n\n", text.strip())

    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]

    lines: list[str] = []
    line_map: dict[int, tuple[int, int]] = {}
    annotated_parts: list[str] = []

    global_line = 1

    for p_idx, paragraph in enumerate(paragraphs, start=1):
        sentences = _split_sentences(paragraph)
        para_lines: list[str] = []

        for local_idx, sentence in enumerate(sentences, start=1):
            label = f"[P{p_idx}, L{global_line}]"
            annotated_line = f"{label}  {sentence}"
            para_lines.append(annotated_line)
            line_map[global_line] = (p_idx, local_idx)
            lines.append(sentence)
            global_line += 1

        annotated_parts.append("\n".join(para_lines))

    return AnnotatedSubmission(
        annotated_text="\n\n".join(annotated_parts),
        line_count=global_line - 1,
        paragraph_count=len(paragraphs),
        line_map=line_map,
    )


def _split_sentences(text: str) -> list[str]:
    """
    Naive sentence splitter that preserves the delimiter. Good enough for
    academic prose. Replace with spaCy `nlp(text).sents` if precision matters.
    """
    # Split on sentence-ending punctuation followed by whitespace or end
    parts = re.split(r"(?<=[.!?])\s+", text.strip())
    return [p.strip() for p in parts if p.strip()]