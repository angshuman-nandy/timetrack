"""Entries CRUD, clock in/out, and time-off/holiday conversion.

Every mutating route commits, then calls storage.backup_now() before returning — that's
the one place in the codebase where the after-every-write sync happens (see storage.py).
"""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session, select

from backend import storage
from backend.auth import get_current_user
from backend.db import get_session
from backend.models import DayEntry, DayKind
from backend.timezone import parse_date_str, today_str, utcnow

router = APIRouter(prefix="/api", tags=["entries"], dependencies=[Depends(get_current_user)])


class EntryOut(BaseModel):
    date: str
    kind: DayKind | None = None
    clock_in: datetime | None = None
    clock_out: datetime | None = None
    hours: float | None = None
    hours_overridden: bool = False
    plan_text: str | None = None
    work_text: str | None = None
    project: str | None = None
    task: str | None = None
    summary: str | None = None
    summary_model: str | None = None
    summary_generated_at: datetime | None = None
    edited: bool = False
    time_off_reason: str | None = None

    @classmethod
    def from_row(cls, date_str: str, row: DayEntry | None) -> "EntryOut":
        if row is None:
            return cls(date=date_str)
        return cls(**row.model_dump())


class ClockInRequest(BaseModel):
    date: str | None = None
    plan_text: str | None = None


class ClockOutRequest(BaseModel):
    date: str | None = None
    work_text: str | None = None


class TimeOffRequest(BaseModel):
    kind: DayKind
    reason: str | None = None


class EntryPatch(BaseModel):
    kind: DayKind | None = None
    clock_in: datetime | None = None
    clock_out: datetime | None = None
    hours: float | None = None
    plan_text: str | None = None
    work_text: str | None = None
    project: str | None = None
    task: str | None = None
    summary: str | None = None
    time_off_reason: str | None = None


def _get_or_404(session: Session, date_str: str) -> DayEntry:
    row = session.get(DayEntry, date_str)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"No entry for {date_str}.")
    return row


def _round_hours(clock_in: datetime, clock_out: datetime) -> float:
    return round((clock_out - clock_in).total_seconds() / 3600, 2)


def _commit_and_sync(session: Session, row: DayEntry) -> DayEntry:
    row.updated_at = utcnow()
    session.add(row)
    session.commit()
    session.refresh(row)
    storage.backup_now()
    return row


@router.get("/entries", response_model=list[EntryOut])
def list_entries(
    start: str,
    end: str,
    session: Session = Depends(get_session),
) -> list[EntryOut]:
    rows = session.exec(
        select(DayEntry).where(DayEntry.date >= start, DayEntry.date <= end).order_by(DayEntry.date)
    ).all()
    return [EntryOut.from_row(r.date, r) for r in rows]


@router.get("/entries/{date}", response_model=EntryOut)
def get_entry(date: str, session: Session = Depends(get_session)) -> EntryOut:
    parse_date_str(date)  # 400s on a malformed date rather than silently returning empty
    row = session.get(DayEntry, date)
    return EntryOut.from_row(date, row)


@router.post("/clock-in", response_model=EntryOut)
def clock_in(body: ClockInRequest, session: Session = Depends(get_session)) -> EntryOut:
    date_str = body.date or today_str()
    row = session.get(DayEntry, date_str)

    if row is not None and row.clock_in is not None and row.clock_out is None:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Already clocked in for {date_str}.")

    if row is None:
        row = DayEntry(date=date_str)

    row.kind = DayKind.work
    row.clock_in = utcnow()
    row.clock_out = None
    row.hours = None
    row.hours_overridden = False
    row.plan_text = body.plan_text
    row.work_text = None
    row.summary = None
    row.summary_model = None
    row.summary_generated_at = None
    row.edited = False

    return EntryOut.from_row(date_str, _commit_and_sync(session, row))


@router.post("/clock-out", response_model=EntryOut)
def clock_out(body: ClockOutRequest, session: Session = Depends(get_session)) -> EntryOut:
    date_str = body.date or today_str()
    row = session.get(DayEntry, date_str)

    if row is None or row.clock_in is None:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Not clocked in for {date_str}.")
    if row.clock_out is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Already clocked out for {date_str}.")

    row.clock_out = utcnow()
    row.work_text = body.work_text
    if not row.hours_overridden:
        row.hours = _round_hours(row.clock_in, row.clock_out)

    return EntryOut.from_row(date_str, _commit_and_sync(session, row))


@router.patch("/entries/{date}", response_model=EntryOut)
def patch_entry(
    date: str, body: EntryPatch, session: Session = Depends(get_session)
) -> EntryOut:
    row = _get_or_404(session, date)

    # exclude_unset, not just "not None" — a client sending {"clock_out": null} means
    # "clear this field" (e.g. Day detail's "Reopen the day"), which must be
    # distinguishable from simply not mentioning the field at all.
    updates = body.model_dump(exclude_unset=True)

    if "hours" in updates:
        row.hours_overridden = updates["hours"] is not None

    for field, value in updates.items():
        setattr(row, field, value)

    if "summary" in updates:
        row.edited = True  # a hand-edit after generation; gates the regenerate warning

    return EntryOut.from_row(date, _commit_and_sync(session, row))


@router.delete("/entries/{date}", status_code=status.HTTP_204_NO_CONTENT)
def delete_entry(date: str, session: Session = Depends(get_session)) -> None:
    row = _get_or_404(session, date)
    session.delete(row)
    session.commit()
    storage.backup_now()


@router.post("/entries/{date}/time-off", response_model=EntryOut)
def set_time_off(
    date: str, body: TimeOffRequest, session: Session = Depends(get_session)
) -> EntryOut:
    """Also used to convert a day back to `work` (Day detail's "Convert back to a
    worked day") — `kind` accepts any DayKind, not only time_off/holiday."""
    row = session.get(DayEntry, date)
    if row is None:
        row = DayEntry(date=date)

    row.kind = body.kind
    row.time_off_reason = body.reason if body.kind != DayKind.work else None

    if body.kind != DayKind.work:
        # No longer a worked day — clear the fields that only make sense for one.
        row.clock_in = None
        row.clock_out = None
        row.plan_text = None
        row.work_text = None
        row.summary = None
        row.summary_model = None
        row.summary_generated_at = None
        row.edited = False
        if not row.hours_overridden:
            row.hours = 0.0

    return EntryOut.from_row(date, _commit_and_sync(session, row))
