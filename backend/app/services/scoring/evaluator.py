"""
evaluator.py
Heart of the AI Grader.  Builds the chain-of-thought prompt, calls the LLM,
parses structured JSON output, and assembles a GradingResult.
"""
from __future__ import annotations

import logging
import re
import textwrap
import uuid

from app.schemas.grading import (
    DimensionScore,
    GradingResult,
    GradingSystem,
    Rubric,
    SWOTAnalysis,
    LineAnnotation
)
from app.services.scoring.grade_mapping import (
    apply_grading_mode,
    is_borderline,
    map_grade,
)
from app.services.scoring.llm_client import call_llm_json
from app.services.scoring.text_annotator import annotate

logger = logging.getLogger(__name__)

# Submission chars sent to the LLM. 8 000 chars ≈ 2 000 tokens, leaving
# plenty of output budget even on providers with a ~4 096-token output cap.
_SUBMISSION_CHAR_LIMIT = 8_000


# ── Prompt construction ──────────────────────────────────────────────────────

_SYSTEM_PROMPT = textwrap.dedent("""
You are an expert academic evaluator with 30 years of experience assessing
student work at university level. Your evaluations are:
  - Evidence-based: you quote specific sentences from the submission.
  - Bias-free: you do not consider student identity, writing dialect, or style preferences.
  - Constructive: you balance critical feedback with actionable improvement advice.
  - Consistent: you apply the rubric identically across all submissions.
  - Instruction-aware: you grade against what the assignment actually asked for,
    not just generic dimension descriptions. If the submission ignores or
    misunderstands the assignment instructions, this must be reflected in the
    Content and Argumentation scores.
  - Actionable: every weakness you identify comes with a concrete next step the
    student can act on, not just a description of the problem.

You MUST respond ONLY with a valid JSON object — no preamble, no markdown fences.
""").strip()


def _build_user_prompt(
    submission: str,
    rubric: Rubric,
    system: GradingSystem,
    subject: str,
    instructions: str | None = None,
) -> str:
    weights = rubric.effective_weights(system)
    mode_label = (
        "ADDITIVE (start at 0, award points for meeting criteria)"
        if rubric.grading_mode.value == "additive"
        else "DEDUCTIVE (start at 100, deduct for errors/omissions)"
    )

    dimensions_block = "\n".join(
        f'  "{dim}": {{\n'
        f'    "description": "{cfg.description}",\n'
        f'    "weight": {weights[dim]}\n'
        f"  }}"
        for dim, cfg in rubric.dimensions.items()
    )

    has_instructions = bool(instructions and instructions.strip())
    instructions_block = (
        textwrap.dedent(f"""
        ASSIGNMENT INSTRUCTIONS (set by the instructor — grade against this)
        ----------------------------------------------------------------
        {instructions.strip()}
        """).strip()
        if has_instructions
        else (
            "ASSIGNMENT INSTRUCTIONS\n"
            "------------------------\n"
            "No specific instructions were provided. Grade generally against "
            "the rubric dimensions and standard academic expectations for "
            f"a {subject} assignment."
        )
    )

    instructions_alignment_field = (
        '      "instructions_alignment": "1-2 sentences on whether the submission '
        'addressed the assignment brief, and what (if anything) it missed.",\n'
        if has_instructions
        else '      "instructions_alignment": null,\n'
    )

    # Truncate submission to stay within provider output budgets.
    truncated = submission[:_SUBMISSION_CHAR_LIMIT]
    truncation_note = (
        f"  ← [truncated to {_SUBMISSION_CHAR_LIMIT} chars]"
        if len(submission) > _SUBMISSION_CHAR_LIMIT
        else ""
    )

    return textwrap.dedent(f"""
    GRADING TASK
    ============
    Subject     : {subject}
    System      : {system.value} ({mode_label})
    Rubric Name : {rubric.name}

    {instructions_block}

    RUBRIC DIMENSIONS
    -----------------
    {{
    {dimensions_block}
    }}

    SUBMISSION TEXT{truncation_note}
    ---------------
    {truncated}

    INSTRUCTIONS FOR YOU (the evaluator)
    -------------------------------------
    First, check the submission against the ASSIGNMENT INSTRUCTIONS above —
    does it actually do what was asked? Note any gaps in your chain of thought.

    Then evaluate the submission step-by-step using chain-of-thought reasoning.
    For EACH dimension:
      1. Identify 2-4 sentences in the submission that are relevant to this dimension.
         Reference them by their [Pn, Ln] label (e.g. "[P2, L8]").
      2. Score the dimension 0-100.
      3. Write a 2-3 sentence evaluation citing those labels.
      4. For each cited location, produce an annotation:
           - "location": "P2, L8"
           - "quote": the exact sentence text (without the label prefix)
           - "issue": what specifically is wrong or strong at that location
           - "suggestion": a concrete, one-sentence fix or reinforcement

    Then:
      - Write a ONE-SENTENCE summary capturing the overall verdict.
      - Compute a weighted aggregate score using the weights above.
      - Identify Strengths, Weaknesses, Opportunities, Threats (SWOT).
        Each item should be specific to THIS submission, not generic advice.
      - Write 2-4 ranked next_steps: concrete, actionable instructions ordered
        by expected impact (highest-impact first). One sentence each.
      - Write an anchored_feedback narrative (3-5 paragraphs) citing specific
        passages and noting whether the assignment instructions were addressed.

    REQUIRED JSON SCHEMA — respond with this EXACT structure and nothing else:
    {{
      "chain_of_thought": ["step 1 reasoning ...", "step 2 ..."],
      "summary": "One-sentence overall verdict.",
{instructions_alignment_field}      "dimension_scores": {{
        "<dim_name>": {{
          "score": 0,
          "evidence": ["[P1, L2] quote...", "[P3, L9] quote..."],
          "chain_of_thought": "Rationale ...",
          "annotations": [
            {{
              "location": "P2, L8",
              "quote": "exact sentence from submission",
              "issue": "What is wrong or strong here.",
              "suggestion": "Concrete one-sentence fix or reinforcement."
            }}
          ]
        }}
      }},
      "swot": {{
        "strengths":     ["specific strength 1", "specific strength 2"],
        "weaknesses":    ["specific weakness 1", "specific weakness 2"],
        "opportunities": ["opportunity 1"],
        "threats":       ["threat 1"]
      }},
      "next_steps": ["Highest-impact action.", "Second action.", "Third action."],
      "anchored_feedback": "3-5 paragraph narrative citing specific passages.",
      "aggregate_score": 0
    }}
    """).strip()


# ── Result assembly ──────────────────────────────────────────────────────────

def _assemble_result(raw_llm: dict, rubric: Rubric, system: GradingSystem, assignment_id: str) -> GradingResult:
    weights = rubric.effective_weights(system)
    dim_scores: dict[str, DimensionScore] = {}
    raw_scores: dict[str, float] = {}
    all_annotations: list[LineAnnotation] = []

    for dim, data in raw_llm.get("dimension_scores", {}).items():
        score = float(data.get("score", 0))
        weight = weights.get(dim, 0)
        weighted = round(score * weight, 2)
        raw_scores[dim] = score

        annotations = [
            LineAnnotation(**a)
            for a in data.get("annotations", [])
            if all(k in a for k in ("location", "quote", "issue", "suggestion"))
        ]
        all_annotations.extend(annotations)

        dim_scores[dim] = DimensionScore(
            score=score,
            weight=weight,
            weighted_score=weighted,
            evidence=data.get("evidence", []),
            chain_of_thought=data.get("chain_of_thought", ""),
            annotations=annotations,
        )

    def _loc_sort_key(a: LineAnnotation) -> tuple[int, int]:
        m = re.match(r"P(\d+),\s*L(\d+)", a.location)
        return (int(m.group(1)), int(m.group(2))) if m else (999, 999)

    all_annotations.sort(key=_loc_sort_key)

    final_score = apply_grading_mode(raw_scores, weights, rubric.grading_mode.value)

    swot_raw = raw_llm.get("swot", {})
    swot = SWOTAnalysis(
        strengths=swot_raw.get("strengths", []),
        weaknesses=swot_raw.get("weaknesses", []),
        opportunities=swot_raw.get("opportunities", []),
        threats=swot_raw.get("threats", []),
    )

    return GradingResult(
        assignment_id=assignment_id,
        grading_system=system,
        raw_score=final_score,
        letter_grade=map_grade(final_score, system),
        summary=raw_llm.get("summary", "").strip()
        or "No summary was generated for this submission.",
        dimension_scores=dim_scores,
        annotations=all_annotations,
        swot=swot,
        anchored_feedback=raw_llm.get("anchored_feedback", ""),
        next_steps=raw_llm.get("next_steps", []),
        instructions_alignment=raw_llm.get("instructions_alignment"),
        flag_for_review=is_borderline(final_score, system),
        chain_of_thought=raw_llm.get("chain_of_thought", []),
    )


# ── Public API ───────────────────────────────────────────────────────────────

def evaluate(
    submission_text: str,
    subject: str,
    grading_system: GradingSystem,
    rubric: Rubric,
    assignment_id: str | None = None,
    instructions: str | None = None,
) -> GradingResult:
    """
    Full evaluation pipeline:
      1. Build chain-of-thought prompt (with optional assignment instructions).
      2. Call LLM (with provider fallback + retry via llm_client).
      3. Parse JSON response.
      4. Assemble and return GradingResult.
    """
    annotated = annotate(submission_text)
    if assignment_id is None:
        assignment_id = str(uuid.uuid4())

    user_prompt = _build_user_prompt(
        annotated.annotated_text,
        rubric,
        grading_system,
        subject,
        instructions,
    )

    logger.info(
        "Evaluating assignment=%s system=%s rubric=%s has_instructions=%s prompt_chars=%d",
        assignment_id, grading_system.value, rubric.name, bool(instructions), len(user_prompt),
    )

    raw_llm = call_llm_json(_SYSTEM_PROMPT, user_prompt)
    result = _assemble_result(raw_llm, rubric, grading_system, assignment_id)

    logger.info(
        "Evaluation complete: score=%.1f grade=%s flag=%s",
        result.raw_score, result.letter_grade, result.flag_for_review,
    )

    return result