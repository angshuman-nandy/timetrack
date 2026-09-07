"""The activity board: a timestamped list of short one-liners logged against a day,
added over time from Today (while clocked in) or Day detail (editing a past day). The
full list for a date is what backend/routers/summary.py feeds the LLM at clock-out,
replacing the old single end-of-day textarea.

Every mutating route ends with storage.backup_now(), same as entries.py.
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
from backend.timezone import parse_date_str

router = APIRouter(prefix="/api", tags=["activities"], dependencies=[Depends(get_current_user)])


class ActivityOut(BaseModel):
    id: int
    date: str
    text: str
    created_at: datetime


class ActivityCreate(BaseModel):
    text: str


@router.get("/entries/{date}/activities", response_model=list[ActivityOut])
def list_activities(date: str, session: Session = Depends(get_session)) -> list[Activity]:
    parse_date_str(date)
    return session.exec(
        select(Activity).where(Activity.date == date).order_by(Activity.created_at)
    ).all()


@router.post("/entries/{date}/activities", response_model=ActivityOut)
def add_activity(
    date: str, body: ActivityCreate, session: Session = Depends(get_session)
) -> Activity:
    parse_date_str(date)
    text = body.text.strip()
    if not text:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Activity text can't be empty.")

    # A day's first activity can arrive before any DayEntry row exists (e.g. logging
    # against a date that's never been touched) — create it, same as clock_in does.
    row = session.get(DayEntry, date)
    if row is None:
        row = DayEntry(date=date, kind=DayKind.work)
        session.add(row)

    activity = Activity(date=date, text=text)
    session.add(activity)
    session.commit()
    session.refresh(activity)
    storage.backup_now()
    return activity


@router.delete("/activities/{activity_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_activity(activity_id: int, session: Session = Depends(get_session)) -> None:
    activity = session.get(Activity, activity_id)
    if activity is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"No activity {activity_id}.")
    session.delete(activity)
    session.commit()
    storage.backup_now()


@router.delete("/entries/{date}/activities", status_code=status.HTTP_204_NO_CONTENT)
def clear_activities(date: str, session: Session = Depends(get_session)) -> None:
    parse_date_str(date)
    for activity in session.exec(select(Activity).where(Activity.date == date)).all():
        session.delete(activity)
    session.commit()
    storage.backup_now()
