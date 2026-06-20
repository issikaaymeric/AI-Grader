"""
subject_rubrics.py
Per-subject default rubrics, organized into four archetypes:

  - ESSAY_RUBRIC        : humanities / social science / prose-based subjects
  - QUANTITATIVE_RUBRIC : math, stats, economics problem-sets
  - TECHNICAL_RUBRIC     : programming / code-based subjects
  - BUSINESS_RUBRIC      : applied business / management case-study subjects

Each subject in SUBJECTS (mirrors the frontend's Dashboard.jsx list) is
mapped to exactly one archetype via SUBJECT_RUBRIC_MAP. Instructors can
still override per-assignment via POST /api/rubrics/ + rubric_id — this
module only supplies the *default* when no rubric_id is given.

To customize a single subject without touching its whole archetype, add
a bespoke Rubric and point that subject's map entry at it directly.
"""
from __future__ import annotations

from app.schemas.grading import DimensionConfig, GradingMode, Rubric

# ── Archetype: Essay / humanities (existing default, unchanged) ─────────────

ESSAY_RUBRIC = Rubric(
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

# ── Archetype: Quantitative (math / stats / econ problem-sets) ──────────────

QUANTITATIVE_RUBRIC = Rubric(
    name="Quantitative Problem Set",
    grading_mode=GradingMode.ADDITIVE,
    dimensions={
        "content": DimensionConfig(
            description=(
                "Correct identification of the relevant concepts, formulas, "
                "or models required by each problem; relevance of the chosen "
                "approach to what was actually asked."
            ),
            weight=0.325,
            us_weight=0.35,
            uk_weight=0.30,
        ),
        "computational_accuracy": DimensionConfig(
            description=(
                "Numerical and symbolic correctness of the final answers, "
                "including correct handling of units, signs, and edge cases."
            ),
            weight=0.375,
            us_weight=0.35,
            uk_weight=0.40,
        ),
        "method_and_working": DimensionConfig(
            description=(
                "Clarity and completeness of shown working/derivation steps; "
                "whether the reasoning trail would let a grader verify the "
                "answer without re-deriving it themselves."
            ),
            weight=0.225,
            us_weight=0.25,
            uk_weight=0.20,
        ),
        "argumentation": DimensionConfig(
            description=(
                "Interpretation and justification of results — explaining "
                "what an answer means in context, sanity-checking magnitude, "
                "and noting assumptions or limitations where relevant."
            ),
            weight=0.075,
            us_weight=0.05,
            uk_weight=0.10,
        ),
    },
)

# ── Archetype: Technical / code-based subjects ───────────────────────────────

TECHNICAL_RUBRIC = Rubric(
    name="Technical / Programming Assignment",
    grading_mode=GradingMode.ADDITIVE,
    dimensions={
        "code_correctness": DimensionConfig(
            description=(
                "Whether the code/solution actually works as required: "
                "produces correct output, handles the specified inputs and "
                "edge cases, and satisfies the stated requirements."
            ),
            weight=0.40,
            us_weight=0.40,
            uk_weight=0.40,
        ),
        "code_quality": DimensionConfig(
            description=(
                "Readability, naming, structure, and adherence to standard "
                "best practices and idioms for the language/framework used; "
                "absence of unnecessary duplication or dead code."
            ),
            weight=0.25,
            us_weight=0.25,
            uk_weight=0.25,
        ),
        "documentation_and_explanation": DimensionConfig(
            description=(
                "Comments, README/setup notes, and any accompanying written "
                "explanation of design decisions — enough for someone else "
                "to understand and run the work."
            ),
            weight=0.15,
            us_weight=0.15,
            uk_weight=0.15,
        ),
        "problem_solving_approach": DimensionConfig(
            description=(
                "Appropriateness of the overall approach/architecture chosen, "
                "including tradeoffs considered and how well the solution "
                "scales or generalizes beyond the minimal happy path."
            ),
            weight=0.20,
            us_weight=0.20,
            uk_weight=0.20,
        ),
    },
)

# ── Archetype: Applied business / management case-study ─────────────────────

BUSINESS_RUBRIC = Rubric(
    name="Applied Business Case Analysis",
    grading_mode=GradingMode.ADDITIVE,
    dimensions={
        "content": DimensionConfig(
            description=(
                "Accuracy and relevance of business concepts, frameworks, "
                "and data used; correct application of the specific tools "
                "the assignment calls for (e.g. SWOT, SMART, MoSCoW, NPV)."
            ),
            weight=0.35,
            us_weight=0.35,
            uk_weight=0.35,
        ),
        "practical_application": DimensionConfig(
            description=(
                "How well the analysis is grounded in the specific scenario "
                "given, rather than generic theory — realistic numbers, "
                "context-appropriate recommendations, feasibility."
            ),
            weight=0.30,
            us_weight=0.30,
            uk_weight=0.30,
        ),
        "structure": DimensionConfig(
            description=(
                "Logical organization of the report/plan, clarity of "
                "headings and flow, appropriate use of tables/figures."
            ),
            weight=0.20,
            us_weight=0.20,
            uk_weight=0.20,
        ),
        "mechanics": DimensionConfig(
            description=(
                "Professional writing register, grammar, spelling, and "
                "citation of any external sources or data used."
            ),
            weight=0.15,
            us_weight=0.15,
            uk_weight=0.15,
        ),
    },
)


# ── Subject → archetype mapping ──────────────────────────────────────────────
# Mirrors the SUBJECTS list in frontend/src/pages/Dashboard.jsx.

SUBJECT_RUBRIC_MAP: dict[str, Rubric] = {
    # Essay / humanities / social science
    "Basic Issues in Philosophy": ESSAY_RUBRIC,
    "Human Geography": ESSAY_RUBRIC,
    "Introduction to Sociology": ESSAY_RUBRIC,
    "Contemporary Short Story": ESSAY_RUBRIC,
    "World History": ESSAY_RUBRIC,
    "Writing in the Disciplines": ESSAY_RUBRIC,
    "World Religions": ESSAY_RUBRIC,
    "The Economics of Discrimination and Poverty": ESSAY_RUBRIC,
    "Organizational Communication": ESSAY_RUBRIC,
    "Interpersonal Communication": ESSAY_RUBRIC,
    "Earth Sciences": ESSAY_RUBRIC,

    # Quantitative
    "Discrete Mathematics": QUANTITATIVE_RUBRIC,
    "Calculus I": QUANTITATIVE_RUBRIC,
    "Calculus II": QUANTITATIVE_RUBRIC,
    "Business Math": QUANTITATIVE_RUBRIC,
    "Business Statistics": QUANTITATIVE_RUBRIC,
    "Macroeconomics": QUANTITATIVE_RUBRIC,
    "Microeconomics": QUANTITATIVE_RUBRIC,

    # Technical / code
    "Introduction to Computer Science": TECHNICAL_RUBRIC,
    "Introduction to Databases": TECHNICAL_RUBRIC,
    "Introduction to Networking": TECHNICAL_RUBRIC,
    "Data Analysis and Visualisation with Python": TECHNICAL_RUBRIC,
    "Introduction to Programming": TECHNICAL_RUBRIC,
    "Front End Development": TECHNICAL_RUBRIC,
    "Back End Development": TECHNICAL_RUBRIC,
    "Mobile End Development": TECHNICAL_RUBRIC,
    "Data Science and Big Data": TECHNICAL_RUBRIC,
    "Network Security and Cryptography": TECHNICAL_RUBRIC,

    # Applied business / management
    "Understanding Business Organizations": BUSINESS_RUBRIC,
    "Financing and Investing Activities": BUSINESS_RUBRIC,
    "Foundations in Finance": BUSINESS_RUBRIC,
    "Essentials of Management": BUSINESS_RUBRIC,
    "Information System and Organisations": BUSINESS_RUBRIC,
    "Financial Management": BUSINESS_RUBRIC,
    "Accounting for Business Operations": BUSINESS_RUBRIC,
    "Business Ethics": BUSINESS_RUBRIC,
    "Principles of Business Operations": BUSINESS_RUBRIC,
    "Microsoft Essential Solutions": BUSINESS_RUBRIC,
    "International Trade": BUSINESS_RUBRIC,
    "Ecommerce / E-Commerce (eBusiness)": BUSINESS_RUBRIC,
    "International Finance": BUSINESS_RUBRIC,
    "IT Project Management": BUSINESS_RUBRIC,
    "Agile Development": BUSINESS_RUBRIC,
}


def get_rubric_for_subject(subject: str | None) -> Rubric:
    """
    Look up the default rubric for a given subject name.

    Falls back to ESSAY_RUBRIC (the original hardcoded default) for any
    subject not in the map — including None/empty, free-typed subjects,
    or subjects added to the frontend list before this map is updated.
    """
    if not subject:
        return ESSAY_RUBRIC
    return SUBJECT_RUBRIC_MAP.get(subject.strip(), ESSAY_RUBRIC)