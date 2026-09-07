"""LLM summarization endpoint. Always fully regenerates when called — the "you've edited
this by hand, overwrite?" confirmation is a frontend concern (the confirm sheet in the
design), gating whether this endpoint gets called at all, not something the backend
re-checks.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from backend import storage
from backend.auth import get_current_user
from backend.config import get_settings
from backend.db import get_session
from backend.llm.base import SummaryUnavailable
from backend.llm.factory import build_provider
from backend.models import Activity, DayEntry
from backend.routers.entries import EntryOut
from backend.timezone import app_tz, utcnow

router = APIRouter(prefix="/api", tags=["summary"], dependencies=[Depends(get_current_user)])


def _activity_lines(session: Session, date: str) -> list[str]:
    rows = session.exec(
        select(Activity).where(Activity.date == date).order_by(Activity.created_at)
    ).all()
    return [f"{a.created_at.astimezone(app_tz()):%H:%M} — {a.text}" for a in rows]


@router.post("/entries/{date}/summarize", response_model=EntryOut)
def summarize_entry(date: str, session: Session = Depends(get_session)) -> EntryOut:
    row = session.get(DayEntry, date)
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"No entry for {date}.")

    try:
        provider = build_provider(get_settings())
        result = provider.summarize(
            plan_text=row.plan_text,
            work_text=row.work_text,
            project=row.project,
            task=row.task,
            hours=row.hours,
            activities=_activity_lines(session, date),
        )
    except SummaryUnavailable as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc

    row.summary = result.summary
    row.project = row.project or result.suggested_project
    row.task = row.task or result.suggested_task
    row.summary_model = provider.model_id
    row.summary_generated_at = utcnow()
    row.edited = False
    row.updated_at = utcnow()

    session.add(row)
    session.commit()
    session.refresh(row)
    storage.backup_now()

    return EntryOut.from_row(date, row)
