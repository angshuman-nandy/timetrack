"""Export correctness: the template drives column order/naming with no code change,
time-off days show 0 hours with the reason as description, and totals sum correctly."""

from __future__ import annotations

import csv
import io

import bcrypt
import openpyxl
import pytest
from fastapi.testclient import TestClient

from backend.config import get_settings
from backend.export import ExportTemplate, build_rows, compute_preview
from backend.models import DayEntry, DayKind


def _sample_entries() -> list[DayEntry]:
    return [
        DayEntry(date="2026-09-01", kind=DayKind.work, project="Acme", task="Build", summary="Did work.", hours=8.0),
        DayEntry(date="2026-09-02", kind=DayKind.time_off, time_off_reason="Sick day", hours=0.0),
    ]


def test_template_reorder_and_rename_is_honored():
    template = ExportTemplate(
        {
            "date_format": "%Y-%m-%d",
            "include_kinds": ["work", "time_off"],
            "columns": [
                {"header": "Client Hours", "field": "hours"},
                {"header": "Notes", "field": "summary"},
            ],
        }
    )
    rows = build_rows(_sample_entries(), template)
    # Column order matches the template exactly: hours first, summary/description second.
    assert rows[0] == [8.0, "Did work."]


def test_time_off_day_shows_zero_hours_and_reason_as_description():
    template = ExportTemplate(
        {
            "date_format": "%Y-%m-%d",
            "include_kinds": ["work", "time_off"],
            "columns": [{"header": "Description", "field": "summary"}, {"header": "Hours", "field": "hours"}],
        }
    )
    rows = build_rows(_sample_entries(), template)
    assert rows[1] == ["Sick day", 0.0]


def test_preview_totals_only_worked_hours():
    template = ExportTemplate(
        {
            "date_format": "%Y-%m-%d",
            "include_kinds": ["work", "time_off"],
            "columns": [{"header": "Hours", "field": "hours"}],
        }
    )
    days, total = compute_preview(_sample_entries(), template)
    assert days == 2
    assert total == 8.0


def test_include_kinds_filters_out_excluded_kind():
    template = ExportTemplate(
        {
            "date_format": "%Y-%m-%d",
            "include_kinds": ["work"],  # time_off excluded
            "columns": [{"header": "Hours", "field": "hours"}],
        }
    )
    rows = build_rows(_sample_entries(), template)
    assert len(rows) == 1


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


def test_export_endpoint_xlsx_has_totals_row(client):
    client.post("/api/clock-in", json={"date": "2026-09-01"})
    client.post("/api/clock-out", json={"date": "2026-09-01"})
    client.patch("/api/entries/2026-09-01", json={"hours": 5.0})

    resp = client.get("/api/export", params={"start": "2026-09-01", "end": "2026-09-30", "format": "xlsx"})
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )

    wb = openpyxl.load_workbook(io.BytesIO(resp.content))
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    assert rows[0][0] == "Date"  # header row from the real export_template.json
    assert rows[-1][0] == "Total"


def test_export_endpoint_csv_downloads(client):
    client.post("/api/clock-in", json={"date": "2026-09-01"})
    client.post("/api/clock-out", json={"date": "2026-09-01"})

    resp = client.get("/api/export", params={"start": "2026-09-01", "end": "2026-09-30", "format": "csv"})
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/csv")

    text = resp.content.decode("utf-8-sig")
    reader = csv.reader(io.StringIO(text))
    header = next(reader)
    assert header == ["Date", "Project", "Task", "Description", "Hours"]


def test_export_preview_endpoint(client):
    client.post("/api/clock-in", json={"date": "2026-09-01"})
    client.post("/api/clock-out", json={"date": "2026-09-01"})
    client.patch("/api/entries/2026-09-01", json={"hours": 3.5})

    resp = client.get("/api/export/preview", params={"start": "2026-09-01", "end": "2026-09-30"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["days_in_range"] == 1
    assert body["total_hours"] == 3.5
