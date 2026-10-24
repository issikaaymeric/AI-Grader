from types import SimpleNamespace

from app.api.routes import analytics


class FakeQuery:
    def __init__(self, rows):
        self.rows = rows
        self.filters = []

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
        {"grading_system": "US", "grade": "A", "flagged_for_review": False},
        {"grading_system": "US", "grade": "Pending", "flagged_for_review": True},
    ])
    monkeypatch.setattr(analytics, "get_supabase", lambda: fake_db)

    result = analytics._load_analytics("user-123")

    assert ("user_id", "user-123") in fake_db.filters
    assert result["total_assignments"] == 2
    assert result["flagged_for_review"] == 1
    assert result["grade_distribution"] == {"US": {"A": 1, "Pending": 1}}


def test_analytics_handles_empty_results(monkeypatch):
    monkeypatch.setattr(analytics, "get_supabase", lambda: FakeQuery([]))

    result = analytics._load_analytics("user-123")

    assert result == {
        "total_assignments": 0,
        "flagged_for_review": 0,
        "grade_distribution": {},
    }
