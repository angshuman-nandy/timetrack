"""Auth correctness: wrong password rejected, expired/forged JWT rejected, protected
routes require a bearer token."""

from __future__ import annotations

import time

import bcrypt
import jwt
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
        yield c


def test_login_rejects_wrong_password(client):
    resp = client.post("/api/auth/login", json={"username": "testuser", "password": "nope"})
    assert resp.status_code == 401


def test_login_accepts_correct_password_and_returns_usable_token(client):
    resp = client.post(
        "/api/auth/login",
        json={"username": "testuser", "password": "correct-horse-battery"},
    )
    assert resp.status_code == 200
    token = resp.json()["token"]

    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert me.json()["username"] == "testuser"


def test_protected_route_rejects_missing_token(client):
    resp = client.get("/api/auth/me")
    assert resp.status_code == 401


def test_protected_route_rejects_forged_token(client):
    forged = jwt.encode({"sub": "testuser"}, "wrong-secret", algorithm="HS256")
    resp = client.get("/api/auth/me", headers={"Authorization": f"Bearer {forged}"})
    assert resp.status_code == 401


def test_protected_route_rejects_expired_token(client):
    settings = get_settings()
    expired = jwt.encode(
        {"sub": "testuser", "iat": int(time.time()) - 100, "exp": int(time.time()) - 50},
        settings.jwt_secret,
        algorithm="HS256",
    )
    resp = client.get("/api/auth/me", headers={"Authorization": f"Bearer {expired}"})
    assert resp.status_code == 401


def test_login_locks_out_after_repeated_failures(client):
    for _ in range(5):
        client.post("/api/auth/login", json={"username": "testuser", "password": "nope"})
    resp = client.post(
        "/api/auth/login",
        json={"username": "testuser", "password": "correct-horse-battery"},
    )
    assert resp.status_code == 429


def test_pasting_the_whole_key_value_line_is_rejected_cleanly(isolated_env, monkeypatch):
    """Regression test for the #1 real-world deploy mistake: pasting the script's whole
    `AUTH_PASSWORD_HASH=$2b$...` output line into a secrets UI, instead of just the hash
    after the `=`. Must reject as a normal wrong-password 401 — not 500, not silently
    "work" some other way."""
    real_hash = bcrypt.hashpw(b"correct-horse-battery", bcrypt.gensalt()).decode()
    monkeypatch.setenv("AUTH_PASSWORD_HASH", f"AUTH_PASSWORD_HASH={real_hash}")
    get_settings.cache_clear()

    from backend import db, main

    db._engine = None
    with TestClient(main.app) as c:
        resp = c.post(
            "/api/auth/login",
            json={"username": "testuser", "password": "correct-horse-battery"},
        )
    assert resp.status_code == 401


def test_trailing_whitespace_in_secrets_is_stripped(isolated_env, monkeypatch):
    """A trailing newline from copy-pasting into a secrets UI is common — the app must
    not treat that as a different, non-matching value."""
    real_hash = bcrypt.hashpw(b"correct-horse-battery", bcrypt.gensalt()).decode()
    monkeypatch.setenv("AUTH_PASSWORD_HASH", f"  {real_hash}\n")
    monkeypatch.setenv("AUTH_USERNAME", "testuser\n")
    get_settings.cache_clear()

    from backend import db, main

    db._engine = None
    with TestClient(main.app) as c:
        resp = c.post(
            "/api/auth/login",
            json={"username": "testuser", "password": "correct-horse-battery"},
        )
    assert resp.status_code == 200
