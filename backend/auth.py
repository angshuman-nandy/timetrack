"""Single-user auth: bcrypt password check, HS256 JWT issue/verify, and a small
in-memory brute-force limiter — the Space URL is public, so this matters even for a
personal app.
"""

from __future__ import annotations

import time
from datetime import timedelta

import bcrypt
import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from backend.config import get_settings
from backend.timezone import utcnow

ALGORITHM = "HS256"
TOKEN_TTL = timedelta(days=30)

MAX_FAILED_ATTEMPTS = 5
LOCKOUT_SECONDS = 5 * 60

_bearer = HTTPBearer(auto_error=False)


class _AttemptLimiter:
    """Tracks failed login attempts per client IP. In-memory and per-process — fine for
    a single-replica free-tier deployment; resets on restart, which is an acceptable
    trade-off for a personal tool."""

    def __init__(self) -> None:
        self._failures: dict[str, list[float]] = {}

    def _recent_failures(self, key: str) -> list[float]:
        cutoff = time.monotonic() - LOCKOUT_SECONDS
        attempts = [t for t in self._failures.get(key, []) if t > cutoff]
        self._failures[key] = attempts
        return attempts

    def is_locked_out(self, key: str) -> bool:
        return len(self._recent_failures(key)) >= MAX_FAILED_ATTEMPTS

    def record_failure(self, key: str) -> None:
        self._failures.setdefault(key, []).append(time.monotonic())

    def reset(self, key: str) -> None:
        self._failures.pop(key, None)


attempt_limiter = _AttemptLimiter()


def verify_password(password: str, password_hash: str) -> bool:
    if not password_hash:
        return False
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except ValueError:
        # Malformed hash in config — treat as "no match" rather than 500ing.
        return False


def authenticate(username: str, password: str) -> bool:
    settings = get_settings()
    if not settings.auth_configured:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Auth is not configured on the server (AUTH_USERNAME / "
            "AUTH_PASSWORD_HASH / JWT_SECRET missing).",
        )
    if username != settings.auth_username:
        return False
    return verify_password(password, settings.auth_password_hash)


def issue_token(username: str) -> str:
    settings = get_settings()
    now = utcnow()
    payload = {
        "sub": username,
        "iat": int(now.timestamp()),
        "exp": int((now + TOKEN_TTL).timestamp()),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITHM)


def _decode_token(token: str) -> str:
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired.")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token.")
    return payload["sub"]


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> str:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return _decode_token(credentials.credentials)


def client_key(request: Request) -> str:
    if request.client:
        return request.client.host
    return "unknown"
