from __future__ import annotations
from enum import Enum
from typing import Any
from pydantic import BaseModel, Field


# ── Enums ──────────────────────────────────────────────────────────────────

class GradingSystem(str, Enum):
    US = "US"
    UK = "UK"


class GradingMode(str, Enum):
    ADDITIVE = "additive"
    DEDUCTIVE = "deductive"


class USGrade(str, Enum):
    A = "A"
    B = "B"
    C = "C"
    D = "D"
    F = "F"


class UKGrade(str, Enum):
    FIRST = "First Class"
    TWO_ONE = "2:1"
    TWO_TWO = "2:2"
    THIRD = "Third Class"
    FAIL = "Fail"


# ── Rubric ─────────────────────────────────────────────────────────────────

class DimensionConfig(BaseModel):
    description: str
    weight: float = Field(gt=0, le=1)
    us_weight: float | None = None
    uk_weight: float | None = None


class Rubric(BaseModel):
    """
    Rubric schema.  weights must sum to 1.0.
    Dimension names are arbitrary (rubric-agnostic).
    """
    name: str
    grading_mode: GradingMode
    dimensions: dict[str, DimensionConfig]

    def effective_weights(self, system: GradingSystem) -> dict[str, float]:
        """Return per-system weights; fall back to generic weight."""
        out: dict[str, float] = {}
        for dim, cfg in self.dimensions.items():
            if system == GradingSystem.US and cfg.us_weight is not None:
                out[dim] = cfg.us_weight
            elif system == GradingSystem.UK and cfg.uk_weight is not None:
                out[dim] = cfg.uk_weight
            else:
                out[dim] = cfg.weight
        return out


# ── Evaluation I/O ─────────────────────────────────────────────────────────

class DimensionScore(BaseModel):
    score: float = Field(ge=0, le=100)
    weight: float
    weighted_score: float
    evidence: list[str]           # Quoted sentences from submission
    chain_of_thought: str


class SWOTAnalysis(BaseModel):
    strengths: list[str]
    weaknesses: list[str]
    opportunities: list[str]
    threats: list[str]


class GradingResult(BaseModel):
    assignment_id: str
    grading_system: GradingSystem
    raw_score: float                          # 0-100
    letter_grade: str                         # US: A-F  |  UK: First / 2:1 …
    dimension_scores: dict[str, DimensionScore]
    swot: SWOTAnalysis
    anchored_feedback: str                    # Narrative with inline quotes
    flag_for_review: bool
    chain_of_thought: list[str]               # Step-by-step log


# ── API request/response wrappers ──────────────────────────────────────────

class AssignmentSubmitRequest(BaseModel):
    subject: str
    grading_system: GradingSystem
    rubric_id: str | None = None              # None → use default rubric


class AssignmentStatusResponse(BaseModel):
    id: str
    status: str                               # pending | processing | done | error
    result: GradingResult | None = None


class RubricCreateRequest(BaseModel):
    name: str
    dimensions: dict[str, DimensionConfig]
    grading_mode: GradingMode = GradingMode.ADDITIVE
