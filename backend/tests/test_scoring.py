"""
Tests for scoring engine components.
Run: pytest backend/tests/ -v
"""
import pytest
from unittest.mock import MagicMock, patch

from app.schemas.grading import (
    DimensionConfig,
    GradingMode,
    GradingSystem,
    Rubric,
)
from app.services.scoring.default_rubric import DEFAULT_RUBRIC
from app.services.scoring.grade_mapping import (
    apply_grading_mode,
    is_borderline,
    map_grade,
)
from app.services.ingestion.extractor import anonymise


# ── grade_mapping ────────────────────────────────────────────────────────────

class TestUSGradeMapping:
    @pytest.mark.parametrize("score,expected", [
        (95, "A"), (85, "B"), (75, "C"), (65, "D"), (55, "F"), (0, "F"),
    ])
    def test_map_grade_us(self, score, expected):
        assert map_grade(score, GradingSystem.US) == expected

    def test_boundary_exactly_90(self):
        assert map_grade(90, GradingSystem.US) == "A"

    def test_boundary_exactly_80(self):
        assert map_grade(80, GradingSystem.US) == "B"


class TestUKGradeMapping:
    @pytest.mark.parametrize("score,expected", [
        (75, "First Class"), (65, "2:1"), (55, "2:2"), (45, "Third Class"), (35, "Fail"),
    ])
    def test_map_grade_uk(self, score, expected):
        assert map_grade(score, GradingSystem.UK) == expected

    def test_exact_70_is_first(self):
        assert map_grade(70, GradingSystem.UK) == "First Class"

    def test_69_is_two_one(self):
        assert map_grade(69, GradingSystem.UK) == "2:1"


class TestBorderlineDetection:
    @pytest.mark.parametrize("score", [68, 69, 70, 71, 72])
    def test_borderline_around_70(self, score):
        assert is_borderline(score, GradingSystem.UK) is True

    @pytest.mark.parametrize("score", [65, 75])
    def test_not_borderline(self, score):
        assert is_borderline(score, GradingSystem.UK) is False

    def test_us_never_borderline(self):
        # US system has no borderline concept
        assert is_borderline(70, GradingSystem.US) is False
        assert is_borderline(90, GradingSystem.US) is False


class TestGradingModes:
    _weights = {"content": 0.4, "structure": 0.3, "argumentation": 0.2, "mechanics": 0.1}
    _scores  = {"content": 80,  "structure": 70,  "argumentation": 90,  "mechanics": 60}

    def test_additive_mode(self):
        # Expected: (80*.4 + 70*.3 + 90*.2 + 60*.1) / 1.0
        expected = 80 * 0.4 + 70 * 0.3 + 90 * 0.2 + 60 * 0.1
        result = apply_grading_mode(self._scores, self._weights, "additive")
        assert abs(result - expected) < 0.01

    def test_deductive_mode(self):
        # Expected: 100 - Σ(weight × (100 - score))
        deduction = sum(
            self._weights[d] * (100 - self._scores[d])
            for d in self._scores
        )
        expected = round(max(0, 100 - deduction), 2)
        result = apply_grading_mode(self._scores, self._weights, "deductive")
        assert abs(result - expected) < 0.01

    def test_deductive_cannot_go_below_zero(self):
        bad_scores = {d: 0 for d in self._weights}
        result = apply_grading_mode(bad_scores, self._weights, "deductive")
        assert result == 0.0


# ── Rubric ───────────────────────────────────────────────────────────────────

class TestRubricWeights:
    def test_default_rubric_us_weights_sum_to_one(self):
        weights = DEFAULT_RUBRIC.effective_weights(GradingSystem.US)
        assert abs(sum(weights.values()) - 1.0) < 0.01

    def test_default_rubric_uk_weights_sum_to_one(self):
        weights = DEFAULT_RUBRIC.effective_weights(GradingSystem.UK)
        assert abs(sum(weights.values()) - 1.0) < 0.01

    def test_us_weight_overrides_generic(self):
        rubric = Rubric(
            name="Test",
            grading_mode=GradingMode.ADDITIVE,
            dimensions={
                "content": DimensionConfig(
                    description="Test", weight=0.5, us_weight=0.7, uk_weight=0.3
                ),
                "structure": DimensionConfig(
                    description="Test", weight=0.5, us_weight=0.3, uk_weight=0.7
                ),
            },
        )
        us = rubric.effective_weights(GradingSystem.US)
        uk = rubric.effective_weights(GradingSystem.UK)
        assert us["content"] == 0.7
        assert uk["content"] == 0.3


# ── Anonymisation ─────────────────────────────────────────────────────────────

class TestAnonymisation:
    def test_strips_student_id(self):
        text = "Student ID: STU00123 submitted the essay."
        result = anonymise(text)
        assert "STU00123" not in result
        assert "[STUDENT_ID]" in result

    def test_strips_email(self):
        text = "Contact me at john.doe@university.edu for questions."
        result = anonymise(text)
        assert "john.doe@university.edu" not in result
        assert "[EMAIL REDACTED]" in result

    def test_strips_name_header(self):
        text = "Name: Jane Smith\nThis essay argues that..."
        result = anonymise(text)
        assert "Jane Smith" not in result

    def test_preserves_content(self):
        text = "The French Revolution began in 1789 and fundamentally changed society."
        result = anonymise(text)
        assert "French Revolution" in result
        assert "1789" in result


# ── Evaluator (mocked LLM) ────────────────────────────────────────────────────

MOCK_LLM_RESPONSE = {
    "chain_of_thought": [
        "Step 1: Read submission and identify main argument.",
        "Step 2: Evaluate each dimension against rubric.",
    ],
    "dimension_scores": {
        "content": {
            "score": 85,
            "evidence": ["The author argues that climate change is anthropogenic."],
            "chain_of_thought": "Strong factual grounding with cited sources.",
        },
        "structure": {
            "score": 78,
            "evidence": ["The essay opens with a clear thesis statement."],
            "chain_of_thought": "Well organised but transitions between sections could improve.",
        },
        "argumentation": {
            "score": 82,
            "evidence": ["Counterarguments are acknowledged and addressed."],
            "chain_of_thought": "Good critical depth; more synthesis across sources would strengthen.",
        },
        "mechanics": {
            "score": 90,
            "evidence": ["All sources follow APA 7th edition format."],
            "chain_of_thought": "Minimal grammatical errors; citation style consistent.",
        },
    },
    "swot": {
        "strengths": ["Strong evidence base", "Clear thesis"],
        "weaknesses": ["Transitions", "Limited counterargument depth"],
        "opportunities": ["Expand synthesis", "Add primary sources"],
        "threats": ["Over-reliance on single source"],
    },
    "anchored_feedback": (
        'The submission demonstrates solid content knowledge. The author\'s claim that '
        '"climate change is anthropogenic" is well-supported. Structure could benefit '
        'from stronger transitions. Mechanics are exemplary.'
    ),
}


class TestEvaluator:
    @patch("app.services.scoring.evaluator.call_llm_json", return_value=MOCK_LLM_RESPONSE)
    def test_evaluate_us_returns_grade(self, _mock):
        from app.services.scoring.evaluator import evaluate

        result = evaluate(
            submission_text="Sample essay text about climate change.",
            subject="Environmental Science",
            grading_system=GradingSystem.US,
            rubric=DEFAULT_RUBRIC,
            assignment_id="test-001",
        )

        assert result.assignment_id == "test-001"
        assert result.grading_system == GradingSystem.US
        assert result.letter_grade in ("A", "B", "C", "D", "F")
        assert 0 <= result.raw_score <= 100
        assert len(result.dimension_scores) == 4
        assert result.swot.strengths

    @patch("app.services.scoring.evaluator.call_llm_json", return_value=MOCK_LLM_RESPONSE)
    def test_evaluate_uk_borderline_flagged(self, _mock):
        """Force a score of 70 (borderline UK) and check flag."""
        from app.services.scoring.evaluator import evaluate, _assemble_result

        # Patch scores to produce exactly 70.0 for UK
        patched = dict(MOCK_LLM_RESPONSE)
        patched["dimension_scores"] = {
            dim: {**data, "score": 70}
            for dim, data in MOCK_LLM_RESPONSE["dimension_scores"].items()
        }

        with patch("app.services.scoring.evaluator.call_llm_json", return_value=patched):
            result = evaluate(
                submission_text="Essay text.",
                subject="History",
                grading_system=GradingSystem.UK,
                rubric=DEFAULT_RUBRIC,
                assignment_id="test-border",
            )

        assert result.flag_for_review is True
        assert result.letter_grade == "First Class"
