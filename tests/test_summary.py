from __future__ import annotations

import bcrypt
import pytest
from fastapi.testclient import TestClient

from backend.config import get_settings
from backend.llm.base import SummaryResult


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


def test_summarize_without_configured_key_returns_503(client):
    client.post("/api/clock-in", json={"date": "2026-09-01", "plan_text": "Ship the thing"})
    client.post("/api/clock-out", json={"date": "2026-09-01", "work_text": "Shipped it"})

    resp = client.post("/api/entries/2026-09-01/summarize")
    assert resp.status_code == 503


def test_summarize_with_mocked_provider_fills_summary_and_clears_edited(client, monkeypatch):
    client.post("/api/clock-in", json={"date": "2026-09-01", "plan_text": "Ship the thing"})
    client.post("/api/clock-out", json={"date": "2026-09-01", "work_text": "Shipped it"})
    client.patch("/api/entries/2026-09-01", json={"summary": "hand-written draft"})
    assert client.get("/api/entries/2026-09-01").json()["edited"] is True

    class FakeProvider:
        model_id = "fake-model-1"

        def summarize(self, **kwargs):
            return SummaryResult(
                summary="Shipped the thing as planned.",
                suggested_project="Acme",
                suggested_task="Delivery",
            )

    monkeypatch.setattr(
        "backend.routers.summary.build_provider", lambda settings: FakeProvider()
    )

    resp = client.post("/api/entries/2026-09-01/summarize")
    assert resp.status_code == 200
    body = resp.json()
    assert body["summary"] == "Shipped the thing as planned."
    assert body["project"] == "Acme"
    assert body["task"] == "Delivery"
    assert body["summary_model"] == "fake-model-1"
    assert body["edited"] is False


def test_summarize_missing_entry_is_404(client):
    resp = client.post("/api/entries/2026-09-01/summarize")
    assert resp.status_code == 404
