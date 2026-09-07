from __future__ import annotations

import bcrypt
import pytest
from fastapi.testclient import TestClient

from backend.config import get_settings


@pytest.fixture
def client(isolated_env, monkeypatch):
    password_hash = bcrypt.hashpw(b"correct-horse-battery", bcrypt.gensalt()).decode()
    monkeypatch.setenv("AUTH_PASSWORD_HASH", password_hash)
    get_settings.cache_clear()

    from backend import db, main

    db._engine = None
    with TestClient(main.app) as c:
        login = c.post(
            "/api/auth/login", json={"username": "testuser", "password": "correct-horse-battery"}
        )
        c.headers.update({"Authorization": f"Bearer {login.json()['token']}"})
        yield c


def test_add_and_list_activities_in_order(client):
    client.post("/api/clock-in", json={"date": "2026-09-01"})

    a = client.post("/api/entries/2026-09-01/activities", json={"text": "Reviewed PR #412"})
    assert a.status_code == 200
    b = client.post("/api/entries/2026-09-01/activities", json={"text": "Client call re: scope"})
    assert b.status_code == 200

    listed = client.get("/api/entries/2026-09-01/activities")
    assert listed.status_code == 200
    texts = [row["text"] for row in listed.json()]
    assert texts == ["Reviewed PR #412", "Client call re: scope"]


def test_add_activity_creates_entry_row_if_missing(client):
    resp = client.post("/api/entries/2026-09-02/activities", json={"text": "Started work"})
    assert resp.status_code == 200

    entry = client.get("/api/entries/2026-09-02").json()
    assert entry["kind"] == "work"


def test_add_activity_rejects_blank_text(client):
    resp = client.post("/api/entries/2026-09-01/activities", json={"text": "   "})
    assert resp.status_code == 400


def test_delete_one_activity(client):
    a = client.post("/api/entries/2026-09-01/activities", json={"text": "First"})
    client.post("/api/entries/2026-09-01/activities", json={"text": "Second"})

    resp = client.delete(f"/api/activities/{a.json()['id']}")
    assert resp.status_code == 204

    listed = client.get("/api/entries/2026-09-01/activities").json()
    assert [row["text"] for row in listed] == ["Second"]


def test_delete_missing_activity_is_404(client):
    resp = client.delete("/api/activities/999999")
    assert resp.status_code == 404


def test_clear_all_activities_for_a_day(client):
    client.post("/api/entries/2026-09-01/activities", json={"text": "First"})
    client.post("/api/entries/2026-09-01/activities", json={"text": "Second"})

    resp = client.delete("/api/entries/2026-09-01/activities")
    assert resp.status_code == 204

    listed = client.get("/api/entries/2026-09-01/activities").json()
    assert listed == []


def test_deleting_entry_cascades_activities(client):
    client.post("/api/clock-in", json={"date": "2026-09-01"})
    client.post("/api/entries/2026-09-01/activities", json={"text": "First"})

    client.delete("/api/entries/2026-09-01")

    listed = client.get("/api/entries/2026-09-01/activities").json()
    assert listed == []


def test_converting_to_time_off_cascades_activities(client):
    client.post("/api/clock-in", json={"date": "2026-09-01"})
    client.post("/api/entries/2026-09-01/activities", json={"text": "First"})

    resp = client.post(
        "/api/entries/2026-09-01/time-off", json={"kind": "holiday", "reason": "Diwali"}
    )
    assert resp.status_code == 200

    listed = client.get("/api/entries/2026-09-01/activities").json()
    assert listed == []
