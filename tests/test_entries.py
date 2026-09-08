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
        token = login.json()["token"]
        c.headers.update({"Authorization": f"Bearer {token}"})
        yield c


def test_get_entry_for_unlogged_day_is_empty_not_404(client):
    resp = client.get("/api/entries/2026-09-10")
    assert resp.status_code == 200
    body = resp.json()
    assert body["kind"] is None
    assert body["clock_in"] is None


def test_full_day_lifecycle(client):
    resp = client.post("/api/clock-in", json={"date": "2026-09-01", "plan_text": "Ship the thing"})
    assert resp.status_code == 200
    assert resp.json()["kind"] == "work"
    assert resp.json()["clock_out"] is None

    # Can't clock in twice while already clocked in.
    resp = client.post("/api/clock-in", json={"date": "2026-09-01"})
    assert resp.status_code == 409

    resp = client.post(
        "/api/clock-out", json={"date": "2026-09-01", "work_text": "Shipped it"}
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["clock_out"] is not None
    assert body["hours"] is not None
    assert body["hours"] >= 0

    # Can't clock out twice.
    resp = client.post("/api/clock-out", json={"date": "2026-09-01"})
    assert resp.status_code == 409

    resp = client.get("/api/entries/2026-09-01")
    assert resp.json()["work_text"] == "Shipped it"


def test_patch_can_override_hours(client):
    client.post("/api/clock-in", json={"date": "2026-09-02"})
    client.post("/api/clock-out", json={"date": "2026-09-02"})

    resp = client.patch("/api/entries/2026-09-02", json={"hours": 6.5})
    assert resp.status_code == 200
    body = resp.json()
    assert body["hours"] == 6.5
    assert body["hours_overridden"] is True


def test_patch_explicit_null_clears_a_field_reopen_the_day(client):
    client.post("/api/clock-in", json={"date": "2026-09-03"})
    client.post("/api/clock-out", json={"date": "2026-09-03", "work_text": "done"})

    # "Reopen the day": clear clock_out so the day goes back to in-progress.
    resp = client.patch("/api/entries/2026-09-03", json={"clock_out": None})
    assert resp.status_code == 200
    assert resp.json()["clock_out"] is None
    # clock_in must be untouched — it wasn't mentioned in the patch body.
    assert resp.json()["clock_in"] is not None


def test_patch_editing_summary_sets_edited_flag(client):
    client.post("/api/clock-in", json={"date": "2026-09-04"})
    client.post("/api/clock-out", json={"date": "2026-09-04"})

    resp = client.patch("/api/entries/2026-09-04", json={"summary": "hand-written summary"})
    assert resp.json()["edited"] is True


def test_time_off_round_trip_and_convert_back_to_work(client):
    resp = client.post(
        "/api/entries/2026-09-05/time-off", json={"kind": "time_off", "reason": "Sick day"}
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["kind"] == "time_off"
    assert body["time_off_reason"] == "Sick day"
    assert body["hours"] == 0.0

    listed = client.get("/api/entries", params={"start": "2026-09-01", "end": "2026-09-28"})
    dates = [e["date"] for e in listed.json()]
    assert "2026-09-05" in dates

    resp = client.post("/api/entries/2026-09-05/time-off", json={"kind": "work"})
    assert resp.json()["kind"] == "work"
    assert resp.json()["time_off_reason"] is None


def test_delete_entry(client):
    client.post("/api/clock-in", json={"date": "2026-09-06"})
    resp = client.delete("/api/entries/2026-09-06")
    assert resp.status_code == 204

    resp = client.get("/api/entries/2026-09-06")
    assert resp.json()["kind"] is None


def test_clock_out_without_clock_in_is_conflict(client):
    resp = client.post("/api/clock-out", json={"date": "2026-09-07"})
    assert resp.status_code == 409


def test_patch_upserts_a_date_with_no_row(client):
    # Calendar: tapping a blank past date and filling in hours by hand — there's no
    # entry yet, so this must create one rather than 404.
    resp = client.patch("/api/entries/2026-09-11", json={"hours": 6.0, "summary": "Manual entry"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["hours"] == 6.0
    assert body["hours_overridden"] is True
    assert body["kind"] == "work"


def test_patch_with_kind_holiday_clears_work_fields(client):
    client.post("/api/clock-in", json={"date": "2026-09-12"})
    client.post("/api/clock-out", json={"date": "2026-09-12", "work_text": "done"})

    resp = client.patch(
        "/api/entries/2026-09-12", json={"kind": "holiday", "time_off_reason": "Diwali"}
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["kind"] == "holiday"
    assert body["time_off_reason"] == "Diwali"
    assert body["clock_in"] is None
    assert body["clock_out"] is None
    assert body["hours"] == 0.0


def test_bulk_kind_marks_non_contiguous_dates_and_overwrites_worked_day(client):
    client.post("/api/clock-in", json={"date": "2026-09-15"})
    client.post("/api/clock-out", json={"date": "2026-09-15", "work_text": "done"})

    resp = client.post(
        "/api/entries/bulk-kind",
        json={"dates": ["2026-09-14", "2026-09-15", "2026-09-17"], "kind": "holiday", "reason": "Break"},
    )
    assert resp.status_code == 200
    assert resp.json()["updated"] == 3

    for date_str in ("2026-09-14", "2026-09-15", "2026-09-17"):
        body = client.get(f"/api/entries/{date_str}").json()
        assert body["kind"] == "holiday"
        assert body["time_off_reason"] == "Break"

    # The previously-worked day had its clock times cleared.
    assert client.get("/api/entries/2026-09-15").json()["clock_in"] is None


def test_pause_and_resume_round_trip(client):
    client.post("/api/clock-in", json={"date": "2026-09-20"})

    resp = client.post("/api/pause", json={"date": "2026-09-20"})
    assert resp.status_code == 200
    assert resp.json()["paused_at"] is not None

    resp = client.post("/api/resume", json={"date": "2026-09-20"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["paused_at"] is None
    assert body["break_seconds"] >= 0


def test_pause_without_clock_in_is_conflict(client):
    resp = client.post("/api/pause", json={"date": "2026-09-21"})
    assert resp.status_code == 409


def test_pause_twice_is_conflict(client):
    client.post("/api/clock-in", json={"date": "2026-09-22"})
    client.post("/api/pause", json={"date": "2026-09-22"})

    resp = client.post("/api/pause", json={"date": "2026-09-22"})
    assert resp.status_code == 409


def test_resume_without_pause_is_conflict(client):
    client.post("/api/clock-in", json={"date": "2026-09-23"})

    resp = client.post("/api/resume", json={"date": "2026-09-23"})
    assert resp.status_code == 409


def test_clock_out_while_paused_auto_resumes_and_subtracts_break(client, monkeypatch):
    import backend.routers.entries as entries_module
    from datetime import datetime, timezone

    # All utcnow() calls within one request return the same mocked "now" — matches
    # reality closely enough (the calls within a request are microseconds apart) and
    # avoids coupling the test to exactly how many times a handler happens to call it.
    current = {"t": datetime(2026, 9, 24, 9, 0, tzinfo=timezone.utc)}
    monkeypatch.setattr(entries_module, "utcnow", lambda: current["t"])

    client.post("/api/clock-in", json={"date": "2026-09-24"})

    current["t"] = datetime(2026, 9, 24, 12, 0, tzinfo=timezone.utc)
    client.post("/api/pause", json={"date": "2026-09-24"})

    current["t"] = datetime(2026, 9, 24, 17, 0, tzinfo=timezone.utc)
    resp = client.post("/api/clock-out", json={"date": "2026-09-24"})

    assert resp.status_code == 200
    body = resp.json()
    assert body["paused_at"] is None
    # 9:00 -> 17:00 is 8h; paused 12:00 -> clock-out(17:00) is 5h of break.
    assert body["break_seconds"] == pytest.approx(5 * 3600)
    assert body["hours"] == pytest.approx(3.0)


def test_routes_require_auth(isolated_env, monkeypatch):
    password_hash = bcrypt.hashpw(b"pw", bcrypt.gensalt()).decode()
    monkeypatch.setenv("AUTH_PASSWORD_HASH", password_hash)
    get_settings.cache_clear()

    from backend import db, main

    db._engine = None
    with TestClient(main.app) as c:
        resp = c.get("/api/entries/2026-09-01")
        assert resp.status_code == 401
