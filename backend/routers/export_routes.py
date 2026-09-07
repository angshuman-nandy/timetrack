from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel
from sqlmodel import Session, select

from backend.auth import get_current_user
from backend.db import get_session
from backend.export import compute_preview, load_template, to_csv_bytes, to_xlsx_bytes
from backend.models import DayEntry

router = APIRouter(prefix="/api/export", tags=["export"], dependencies=[Depends(get_current_user)])


class PreviewResponse(BaseModel):
    days_in_range: int
    total_hours: float


def _entries_in_range(session: Session, start: str, end: str) -> list[DayEntry]:
    return list(
        session.exec(
            select(DayEntry).where(DayEntry.date >= start, DayEntry.date <= end).order_by(DayEntry.date)
        ).all()
    )


@router.get("/preview", response_model=PreviewResponse)
def export_preview(start: str, end: str, session: Session = Depends(get_session)) -> PreviewResponse:
    entries = _entries_in_range(session, start, end)
    template = load_template()
    days, hours = compute_preview(entries, template)
    return PreviewResponse(days_in_range=days, total_hours=hours)


@router.get("")
def export_download(
    start: str,
    end: str,
    format: Literal["xlsx", "csv"] = "xlsx",
    session: Session = Depends(get_session),
) -> Response:
    entries = _entries_in_range(session, start, end)
    template = load_template()
    filename = f"timesheet-{start}-to-{end}.{format}"

    if format == "csv":
        content = to_csv_bytes(entries, template)
        media_type = "text/csv"
    else:
        content = to_xlsx_bytes(entries, template)
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
