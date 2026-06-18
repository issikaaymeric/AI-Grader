"""
grade_mapping.py
Convert a raw 0-100 score to a letter / classification.
Also detects UK borderline cases that warrant human review.
"""
from app.schemas.grading import GradingSystem

# US thresholds (additive: starts at 0)
_US_BANDS = [
    (90, "A"),
    (80, "B"),
    (70, "C"),
    (60, "D"),
    (0,  "F"),
]

# UK thresholds (deductive: starts at 100)
_UK_BANDS = [
    (70, "First Class"),
    (60, "2:1"),
    (50, "2:2"),
    (40, "Third Class"),
    (0,  "Fail"),
]

# UK borderline window (±2 around each boundary)
_UK_BOUNDARIES = {70, 60, 50, 40}
_BORDERLINE_MARGIN = 2


def map_grade(score: float, system: GradingSystem) -> str:
    bands = _US_BANDS if system == GradingSystem.US else _UK_BANDS
    for threshold, grade in bands:
        if score >= threshold:
            return grade
    return bands[-1][1]


def is_borderline(score: float, system: GradingSystem) -> bool:
    """Flag UK submissions within ±2 points of a classification boundary."""
    if system != GradingSystem.UK:
        return False
    return any(abs(score - b) <= _BORDERLINE_MARGIN for b in _UK_BOUNDARIES)


def apply_grading_mode(
    dimension_raw_scores: dict[str, float],
    weights: dict[str, float],
    mode: str,   # "additive" | "deductive"
) -> float:
    """
    Additive:  weighted_sum / total_weight  → 0-100
    Deductive: 100 - Σ(deduction per dimension)
    Both ultimately return a 0-100 final score.
    """
    if mode == "additive":
        weighted_sum = sum(
            dimension_raw_scores[d] * weights[d]
            for d in dimension_raw_scores
            if d in weights
        )
        total_weight = sum(weights[d] for d in dimension_raw_scores if d in weights)
        return round(weighted_sum / total_weight, 2) if total_weight else 0.0

    # Deductive: each dimension contributes a deduction = weight × (100 - score)
    total_deduction = sum(
        weights[d] * (100 - dimension_raw_scores[d])
        for d in dimension_raw_scores
        if d in weights
    )
    return round(max(0.0, 100.0 - total_deduction), 2)
