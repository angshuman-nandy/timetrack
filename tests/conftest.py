"""Shared test fixtures. Every test gets its own isolated DB_PATH/DATA_DIR under a temp
directory, and a clean settings cache, so tests never touch the real .env-configured
paths or leak state between each other."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pytest

from backend.config import get_settings


@pytest.fixture(autouse=True)
def reset_attempt_limiter():
    """The login rate limiter is a module-level singleton (by design — it must survive
    across requests within one process). Reset it between tests so one test's lockout
    doesn't leak into the next."""
    from backend.auth import attempt_limiter

    attempt_limiter._failures.clear()
    yield
    attempt_limiter._failures.clear()


@pytest.fixture
def isolated_env(tmp_path, monkeypatch):
    db_path = tmp_path / "db" / "timetrack.db"
    data_dir = tmp_path / "data"
    data_dir.mkdir()

    monkeypatch.setenv("DB_PATH", str(db_path))
    monkeypatch.setenv("DATA_DIR", str(data_dir))
    monkeypatch.setenv("APP_TIMEZONE", "Asia/Kolkata")
    monkeypatch.setenv("AUTH_USERNAME", "testuser")
    monkeypatch.setenv("JWT_SECRET", "test-secret-not-for-prod")
    # pydantic-settings falls back to reading the real .env file for any var not
    # explicitly set here — without this, tests would silently pick up real API keys
    # from the developer's .env (and make live, billed calls). Tests that want to
    # exercise a "configured" LLM provider set these explicitly themselves.
    monkeypatch.setenv("ANTHROPIC_API_KEY", "")
    monkeypatch.setenv("OPENAI_API_KEY", "")
    monkeypatch.setenv("LLM_MODEL", "")
    get_settings.cache_clear()

    yield {"db_path": db_path, "data_dir": data_dir}

    get_settings.cache_clear()
