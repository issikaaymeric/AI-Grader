from types import SimpleNamespace

from app.api.routes import analytics


class FakeQuery:
    def __init__(self, rows):
        self.rows = rows
        self.filters = []
        self.columns = None

    def table(self, name):
        self.table_name = name
        return self

    def select(self, columns):
        self.columns = columns
        return self

    def eq(self, key, value):
        self.filters.append((key, value))
        return self

    def execute(self):
        return SimpleNamespace(data=self.rows)


def test_analytics_is_scoped_to_current_user(monkeypatch):
    fake_db = FakeQuery([
        {
            "grading_system": "US",
            "grade": "A",
            "score": 91,
            "status": "completed",
            "flagged_for_review": False,
            "created_at": "2026-10-03T10:00:00Z",
        },
        {
            "grading_system": "US",
            "grade": None,
            "score": None,
            "status": "pending",
            "flagged_for_review": True,
            "created_at": "2026-10-05T10:00:00Z",
        },
        {
            "grading_system": "UK",
            "grade": "First Class",
            "score": "87.5",
            "status": "completed",
            "flagged_for_review": False,
            "created_at": "not-a-date",
        },
    ])
    monkeypatch.setattr(analytics, "get_supabase", lambda: fake_db)

    result = analytics._load_analytics("user-123")

    assert ("user_id", "user-123") in fake_db.filters
    assert fake_db.table_name == "assignments"
    assert "score" in fake_db.columns
    assert result["total_assignments"] == 3
    assert result["graded_assignments"] == 2
    assert result["pending_assignments"] == 1
    assert result["failed_assignments"] == 0
    assert result["flagged_for_review"] == 1
    assert result["scored_assignments"] == 2
    assert result["average_score"] == 89.25
    assert result["grade_distribution"] == {
        "US": {"A": 1},
        "UK": {"First Class": 1},
    }
    assert result["status_distribution"] == {"completed": 2, "pending": 1}
    assert len(result["monthly_activity"]) == 6
    assert all({"month", "count"} <= set(item) for item in result["monthly_activity"])


def test_analytics_handles_empty_results(monkeypatch):
    monkeypatch.setattr(analytics, "get_supabase", lambda: FakeQuery([]))

    result = analytics._load_analytics("user-123")

    assert result["total_assignments"] == 0
    assert result["graded_assignments"] == 0
    assert result["pending_assignments"] == 0
    assert result["failed_assignments"] == 0
    assert result["flagged_for_review"] == 0
    assert result["scored_assignments"] == 0
    assert result["average_score"] is None
    assert result["grade_distribution"] == {}
    assert result["status_distribution"] == {}
    assert len(result["monthly_activity"]) == 6
    assert all(item["count"] == 0 for item in result["monthly_activity"])
