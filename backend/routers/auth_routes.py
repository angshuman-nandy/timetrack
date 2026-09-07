from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel

from backend import auth

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    token: str


class MeResponse(BaseModel):
    username: str


@router.post("/login", response_model=LoginResponse)
def login(body: LoginRequest, request: Request) -> LoginResponse:
    key = auth.client_key(request)
    if auth.attempt_limiter.is_locked_out(key):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many failed attempts. Try again in a few minutes.",
        )

    if not auth.authenticate(body.username, body.password):
        auth.attempt_limiter.record_failure(key)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password.",
        )

    auth.attempt_limiter.reset(key)
    return LoginResponse(token=auth.issue_token(body.username))


@router.get("/me", response_model=MeResponse)
def me(username: str = Depends(auth.get_current_user)) -> MeResponse:
    return MeResponse(username=username)
