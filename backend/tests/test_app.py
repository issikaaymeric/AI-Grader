from fastapi.testclient import TestClient

from app.main import app


def test_health_endpoint_reports_service_status():
    response = TestClient(app).get("/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_history_and_analytics_routes_are_registered():
    paths = set(app.openapi()['paths'])

    assert "/api/history/" in paths
    assert "/api/analytics/" in paths
    assert "/api/rubrics/" in paths
