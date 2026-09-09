"""Template-driven timesheet export. `export_template.json` at the repo root is the only
file that needs editing to match the client's real column format — this module reads it
fresh on every request, so an edit takes effect with no restart.
"""

from __future__ import annotations

import copy
import csv
import io
import json
from pathlib import Path
from typing import Any

from openpyxl import Workbook

from backend.models import DayEntry, DayKind

_TEMPLATE_PATH = Path(__file__).resolve().parent.parent / "export_template.json"

_KIND_LABELS: dict[DayKind, str] = {
    DayKind.time_off: "Time off",
    DayKind.holiday: "Holiday",
}


class ExportTemplate:
    def __init__(self, raw: dict) -> None:
        self.date_format: str = raw.get("date_format", "%Y-%m-%d")
        self.include_kinds: set[str] = set(raw.get("include_kinds", ["work", "time_off", "holiday"]))
        self.columns: list[dict] = raw["columns"]
        self.totals_row: bool = raw.get("totals_row", False)

    def with_columns(self, fields: set[str]) -> "ExportTemplate":
        """A copy of this template restricted to the given field names, keeping the
        template's own column order — the Export screen's field picker chooses *which*
        of the template's columns to include for one download, never their order or
        headers, so `export_template.json` stays the single place that controls those."""
        clone = copy.copy(self)
        clone.columns = [c for c in self.columns if c["field"] in fields]
        return clone


def load_template() -> ExportTemplate:
    with open(_TEMPLATE_PATH, encoding="utf-8") as f:
        return ExportTemplate(json.load(f))


def _field_value(entry: DayEntry, field: str, template: ExportTemplate) -> Any:
    """A day marked time off/holiday exports with 0 hours and "Holiday"/"Time off" (plus
    the reason, if one was given) standing in for the description, so leave is visible
    on the sheet without a separate column even when no reason was entered."""
    if field == "date":
        from backend.timezone import parse_date_str

        return parse_date_str(entry.date).strftime(template.date_format)
    if entry.kind != DayKind.work:
        if field == "hours":
            return 0.0
        if field == "summary":
            label = _KIND_LABELS.get(entry.kind, entry.kind.value)
            return f"{label} — {entry.time_off_reason}" if entry.time_off_reason else label
    value = getattr(entry, field, None)
    if value is None:
        return ""
    if hasattr(value, "value"):  # enum
        return value.value
    return value


def filter_entries(entries: list[DayEntry], template: ExportTemplate) -> list[DayEntry]:
    return [e for e in entries if e.kind.value in template.include_kinds]


def build_rows(entries: list[DayEntry], template: ExportTemplate) -> list[list[Any]]:
    """Filters by `include_kinds` internally — callers pass the raw query result, not a
    pre-filtered list, so there's exactly one place that decides which days are in."""
    included = filter_entries(entries, template)
    return [[_field_value(e, col["field"], template) for col in template.columns] for e in included]


def compute_preview(entries: list[DayEntry], template: ExportTemplate) -> tuple[int, float]:
    included = filter_entries(entries, template)
    total_hours = sum((e.hours or 0.0) for e in included if e.kind == DayKind.work)
    return len(included), round(total_hours, 2)


def _hours_column_index(template: ExportTemplate) -> int | None:
    for i, col in enumerate(template.columns):
        if col["field"] == "hours":
            return i
    return None


def to_xlsx_bytes(entries: list[DayEntry], template: ExportTemplate) -> bytes:
    rows = build_rows(entries, template)

    wb = Workbook()
    ws = wb.active
    ws.title = "Timesheet"
    ws.append([col["header"] for col in template.columns])
    for row in rows:
        ws.append(row)

    if template.totals_row:
        hours_idx = _hours_column_index(template)
        if hours_idx is not None:
            total = sum(r[hours_idx] for r in rows if isinstance(r[hours_idx], (int, float)))
            totals = [""] * len(template.columns)
            totals[0] = "Total"
            totals[hours_idx] = round(total, 2)
            ws.append(totals)

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def to_csv_bytes(entries: list[DayEntry], template: ExportTemplate) -> bytes:
    rows = build_rows(entries, template)

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([col["header"] for col in template.columns])
    writer.writerows(rows)

    if template.totals_row:
        hours_idx = _hours_column_index(template)
        if hours_idx is not None:
            total = sum(r[hours_idx] for r in rows if isinstance(r[hours_idx], (int, float)))
            totals = [""] * len(template.columns)
            totals[0] = "Total"
            totals[hours_idx] = round(total, 2)
            writer.writerow(totals)

    return buf.getvalue().encode("utf-8-sig")  # BOM so Excel opens UTF-8 CSVs correctly
