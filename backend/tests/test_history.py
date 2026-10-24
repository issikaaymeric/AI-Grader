from types import SimpleNamespace

from app.api.routes import history


class FakeQuery:
    def __init__(self, rows, count=None):
        self.rows = rows
        self.count = len(rows) if count is None else count
        self.filters = []
        self.order_args = None
        self.range_args = None

    def table(self, name):
        self.table_name = name
        return self

    def select(self, columns, **kwargs):
        self.columns = columns
        self.select_options = kwargs
        return self

    def eq(self, key, value):
        self.filters.append((key, value))
        return self

    def order(self, column, desc=False):
        self.order_args = (column, desc)
        return self

    def range(self, start, end):
        self.range_args = (start, end)
        return self

    def execute(self):
        return SimpleNamespace(data=self.rows, count=self.count)


def test_load_history_filters_by_user_and_parses_result(monkeypatch):
    rows = [
        {
            "id": "assignment-1",
            "user_id": "user-1",
            "feedback_json": '{"raw_score": 88}',
            "created_at": "2026-10-24T10:00:00Z",
        }
    ]
    fake_db = FakeQuery(rows, count=37)
    monkeypatch.setattr(history, "get_supabase", lambda: fake_db)

    result = history._load_history("user-1", limit=10, offset=20)

    assert fake_db.table_name == "assignments"
    assert ("user_id", "user-1") in fake_db.filters
    assert fake_db.order_args == ("created_at", True)
    assert fake_db.range_args == (20, 29)
    assert fake_db.select_options == {"count": "exact"}
    assert result["total"] == 37
    assert result["items"][0]["result"] == {"raw_score": 88}
    assert "feedback_json" not in result["items"][0]


def test_load_history_handles_missing_or_invalid_feedback(monkeypatch):
    rows = [
        {"id": "assignment-1", "feedback_json": None},
        {"id": "assignment-2", "feedback_json": "{not-json"},
    ]
    monkeypatch.setattr(history, "get_supabase", lambda: FakeQuery(rows))

    result = history._load_history("user-1", limit=5, offset=0)

    assert [item["result"] for item in result["items"]] == [None, None]
