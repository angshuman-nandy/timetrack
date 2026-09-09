from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel
from sqlmodel import Session, select

from backend.auth import get_current_user
from backend.consultant_export import (
    ConsultantHeader,
    load_consultant_config,
    to_consultant_xlsx_bytes,
)
from backend.db import get_session
from backend.export import compute_preview, load_template, to_csv_bytes, to_xlsx_bytes
from backend.models import DayEntry
from backend.timezone import parse_date_str

router = APIRouter(prefix="/api/export", tags=["export"], dependencies=[Depends(get_current_user)])


class PreviewResponse(BaseModel):
    days_in_range: int
    total_hours: float


class ColumnOut(BaseModel):
    header: str
    field: str


class ConsultantTemplateOut(BaseModel):
    consultant_name: str
    header_defaults: dict[str, str]
    field_defaults: dict[str, str]
    options: dict[str, list[str]]


def _entries_in_range(session: Session, start: str, end: str) -> list[DayEntry]:
    return list(
        session.exec(
            select(DayEntry).where(DayEntry.date >= start, DayEntry.date <= end).order_by(DayEntry.date)
        ).all()
    )


@router.get("/columns", response_model=list[ColumnOut])
def export_columns() -> list[ColumnOut]:
    """The template's available columns, for the Export screen's field picker — which
    of these get included in one download is a per-request choice, not a template edit."""
    return [ColumnOut(**c) for c in load_template().columns]


@router.get("/preview", response_model=PreviewResponse)
def export_preview(start: str, end: str, session: Session = Depends(get_session)) -> PreviewResponse:
    entries = _entries_in_range(session, start, end)
    template = load_template()
    days, hours = compute_preview(entries, template)
    return PreviewResponse(days_in_range=days, total_hours=hours)


@router.get("/consultant-template", response_model=ConsultantTemplateOut)
def consultant_template(username: str = Depends(get_current_user)) -> ConsultantTemplateOut:
    """Header defaults and dropdown option lists for the Consultant Timesheet format —
    one source the Export overlay, and the Today/Day detail dropdowns, all read from,
    instead of duplicating `consultant_template.json`'s contents in the frontend."""
    config = load_consultant_config()
    return ConsultantTemplateOut(
        consultant_name=username,
        header_defaults=config.header_defaults,
        field_defaults=config.field_defaults,
        options=config.options,
    )


@router.get("")
def export_download(
    start: str,
    end: str,
    format: Literal["xlsx", "csv", "consultant"] = "xlsx",
    columns: str | None = None,
    consultant_name: str | None = None,
    project_program: str | None = None,
    vendor_company: str | None = None,
    technical_lead: str | None = None,
    pmo_reviewer: str | None = None,
    session: Session = Depends(get_session),
    username: str = Depends(get_current_user),
) -> Response:
    entries = _entries_in_range(session, start, end)

    if format == "consultant":
        config = load_consultant_config()
        start_date, end_date = parse_date_str(start), parse_date_str(end)
        if end_date < start_date:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "End date must not be before start date.")
        header = ConsultantHeader(
            consultant_name=consultant_name or username,
            project_program=project_program or config.header_defaults.get("project_program", ""),
            vendor_company=vendor_company or config.header_defaults.get("vendor_company", ""),
            technical_lead=technical_lead or config.header_defaults.get("technical_lead", ""),
            pmo_reviewer=pmo_reviewer or config.header_defaults.get("pmo_reviewer", ""),
            period_start=start_date,
            period_end=end_date,
        )
        try:
            content = to_consultant_xlsx_bytes(entries, header, config)
        except ValueError as exc:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
        filename = f"consultant-timesheet-{start}-to-{end}.xlsx"
        return Response(
            content=content,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    template = load_template()

    if columns is not None:
        selected = {f for f in columns.split(",") if f}
        template = template.with_columns(selected)
        if not template.columns:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Select at least one field to export.")

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
