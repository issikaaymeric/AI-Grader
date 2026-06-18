"""
default_rubric.py
Hardcoded 4-dimensional rubric used in MVP / testing.
Professors can override this via POST /api/rubrics/.
"""
from app.schemas.grading import DimensionConfig, GradingMode, Rubric

DEFAULT_RUBRIC = Rubric(
    name="Standard Academic Essay",
    grading_mode=GradingMode.ADDITIVE,
    dimensions={
        "content": DimensionConfig(
            description=(
                "Accuracy of information, relevance to the prompt, "
                "use of supporting evidence and sources."
            ),
            weight=0.375,       # geometric mean of US (0.40) and UK (0.35)
            us_weight=0.40,
            uk_weight=0.35,
        ),
        "structure": DimensionConfig(
            description=(
                "Coherence of argument, clarity of thesis statement, "
                "logical flow and effective use of transitions."
            ),
            weight=0.225,
            us_weight=0.25,
            uk_weight=0.20,
        ),
        "argumentation": DimensionConfig(
            description=(
                "Depth of critical analysis, synthesis of multiple "
                "perspectives, identification and rebuttal of counterarguments."
            ),
            weight=0.275,
            us_weight=0.25,
            uk_weight=0.30,
        ),
        "mechanics": DimensionConfig(
            description=(
                "Grammar, spelling, punctuation, citation style "
                "(APA / MLA / Harvard) and academic register."
            ),
            weight=0.125,
            us_weight=0.10,
            uk_weight=0.15,
        ),
    },
)
