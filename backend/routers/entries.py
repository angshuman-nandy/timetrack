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
from backend.models import Activity, DayEntry, DayKind
from backend.timezone import app_tz, parse_date_str, today_str, utcnow

router = APIRouter(prefix="/api", tags=["entries"], dependencies=[Depends(get_current_user)])


class EntryOut(BaseModel):
    date: str
    kind: DayKind | None = None
    clock_in: datetime | None = None
    clock_out: datetime | None = None
    hours: float | None = None
    hours_overridden: bool = False
    paused_at: datetime | None = None
    break_seconds: float = 0.0
    plan_text: str | None = None
    work_text: str | None = None
    project: str | None = None
    task: str | None = None
    summary: str | None = None
    summary_model: str | None = None
    summary_generated_at: datetime | None = None
    edited: bool = False
    time_off_reason: str | None = None
    location: str | None = None
    deliverable: str | None = None
    category: str | None = None
    status: str | None = None
    remarks: str | None = None

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


class BreakRequest(BaseModel):
    date: str | None = None


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
    location: str | None = None
    deliverable: str | None = None
    category: str | None = None
    status: str | None = None
    remarks: str | None = None


class BulkKindRequest(BaseModel):
    dates: list[str]
    kind: DayKind
    reason: str | None = None


def _get_or_404(session: Session, date_str: str) -> DayEntry:
    row = session.get(DayEntry, date_str)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"No entry for {date_str}.")
    return row


def _round_hours(clock_in: datetime, clock_out: datetime, break_seconds: float = 0.0) -> float:
    worked_seconds = (clock_out - clock_in).total_seconds() - break_seconds
    return round(max(worked_seconds, 0.0) / 3600, 2)


def _commit_and_sync(session: Session, row: DayEntry) -> DayEntry:
    row.updated_at = utcnow()
    session.add(row)
    session.commit()
    session.refresh(row)
    storage.backup_now()
    return row


def _clear_activities(session: Session, date_str: str) -> None:
    for activity in session.exec(select(Activity).where(Activity.date == date_str)).all():
        session.delete(activity)


def _apply_kind(session: Session, row: DayEntry, kind: DayKind, reason: str | None) -> DayEntry:
    """Shared by the dedicated time-off endpoint, patch_entry (editing a day's kind
    in place), and bulk-kind — one place decides what changing a day's kind does."""
    row.kind = kind
    row.time_off_reason = reason if kind != DayKind.work else None

    if kind != DayKind.work:
        # No longer a worked day — clear the fields that only make sense for one, and
        # the activity board along with them (they'd otherwise dangle, orphaned from
        # any UI, and re-surface if the day is ever converted back to work).
        #
        # location/deliverable/category/status/remarks (the Consultant Timesheet
        # fields) are deliberately left alone here, same as project/task above them —
        # descriptive metadata, not session state, so an accidental Work → Holiday →
        # Work toggle doesn't silently discard typed data. The export itself is the
        # one place that decides what a non-work day shows (backend/consultant_export.py
        # blanks them for any day whose kind isn't "work" regardless of what's stored).
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
        _clear_activities(session, row.date)

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
    row.paused_at = None
    row.break_seconds = 0.0
    row.plan_text = body.plan_text
    row.work_text = None
    row.summary = None
    row.summary_model = None
    row.summary_generated_at = None
    row.edited = False

    return EntryOut.from_row(date_str, _commit_and_sync(session, row))


@router.post("/pause", response_model=EntryOut)
def pause(body: BreakRequest, session: Session = Depends(get_session)) -> EntryOut:
    date_str = body.date or today_str()
    row = session.get(DayEntry, date_str)

    if row is None or row.clock_in is None or row.clock_out is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Not clocked in for {date_str}.")
    if row.paused_at is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Already on a break for {date_str}.")

    row.paused_at = utcnow()
    return EntryOut.from_row(date_str, _commit_and_sync(session, row))


@router.post("/resume", response_model=EntryOut)
def resume(body: BreakRequest, session: Session = Depends(get_session)) -> EntryOut:
    date_str = body.date or today_str()
    row = session.get(DayEntry, date_str)

    if row is None or row.paused_at is None:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Not on a break for {date_str}.")

    row.break_seconds += (utcnow() - row.paused_at).total_seconds()
    row.paused_at = None
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
    if row.paused_at is not None:
        # Clocking out directly from a break — count the break up to now, same as an
        # explicit Resume, rather than requiring one before you can end the day.
        row.break_seconds += (row.clock_out - row.paused_at).total_seconds()
        row.paused_at = None
    if body.work_text:
        row.work_text = body.work_text
    else:
        # No explicit end-of-day notes — fall back to the activity board, so the
        # export/LLM path (which reads work_text) still has something for a day
        # logged entirely through the board.
        activities = session.exec(
            select(Activity).where(Activity.date == date_str).order_by(Activity.created_at)
        ).all()
        row.work_text = (
            "\n".join(f"{a.created_at.astimezone(app_tz()):%H:%M} — {a.text}" for a in activities)
            or None
        )
    if not row.hours_overridden:
        row.hours = _round_hours(row.clock_in, row.clock_out, row.break_seconds)

    return EntryOut.from_row(date_str, _commit_and_sync(session, row))


@router.patch("/entries/{date}", response_model=EntryOut)
def patch_entry(
    date: str, body: EntryPatch, session: Session = Depends(get_session)
) -> EntryOut:
    # Upsert, not _get_or_404: editing a blank past date from the calendar is a normal
    # flow (GET /entries/{date} returns a synthetic empty row for one with no data, so
    # the frontend has nothing else to PATCH against).
    parse_date_str(date)
    row = session.get(DayEntry, date)
    if row is None:
        row = DayEntry(date=date)

    # exclude_unset, not just "not None" — a client sending {"clock_out": null} means
    # "clear this field" (e.g. Day detail's "Reopen the day"), which must be
    # distinguishable from simply not mentioning the field at all.
    updates = body.model_dump(exclude_unset=True)

    if "hours" in updates:
        row.hours_overridden = updates["hours"] is not None

    if "kind" in updates:
        # Route through _apply_kind so switching kind via a plain PATCH (Day detail's
        # Work/Time off/Holiday control) has the same side effects as the dedicated
        # /time-off endpoint — clearing work-only fields and the activity board.
        kind = updates.pop("kind")
        reason = updates.pop("time_off_reason", row.time_off_reason)
        _apply_kind(session, row, kind, reason)

    for field, value in updates.items():
        setattr(row, field, value)

    if "summary" in updates:
        row.edited = True  # a hand-edit after generation; gates the regenerate warning

    return EntryOut.from_row(date, _commit_and_sync(session, row))


@router.delete("/entries/{date}", status_code=status.HTTP_204_NO_CONTENT)
def delete_entry(date: str, session: Session = Depends(get_session)) -> None:
    row = _get_or_404(session, date)
    _clear_activities(session, date)
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

    _apply_kind(session, row, body.kind, body.reason)

    return EntryOut.from_row(date, _commit_and_sync(session, row))


@router.post("/entries/bulk-kind")
def bulk_set_kind(
    body: BulkKindRequest, session: Session = Depends(get_session)
) -> dict:
    """Calendar multi-select → mark a (possibly non-contiguous) set of days as time off
    or holiday in one request. One commit and one bucket sync for the whole batch —
    the entire reason this exists instead of looping the single-day endpoint client-side."""
    updated = 0
    for date_str in body.dates:
        parse_date_str(date_str)  # 400s on a malformed date before touching the DB
        row = session.get(DayEntry, date_str)
        if row is None:
            row = DayEntry(date=date_str)
        _apply_kind(session, row, body.kind, body.reason)
        row.updated_at = utcnow()
        session.add(row)
        updated += 1

    session.commit()
    storage.backup_now()
    return {"updated": updated}
