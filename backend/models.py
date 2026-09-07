"""SQLModel tables. See plan.md → Data model for the field-by-field rationale."""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum

from sqlalchemy import Column
from sqlalchemy.types import DateTime, TypeDecorator
from sqlmodel import Field, SQLModel

from backend.timezone import utcnow


class UTCDateTime(TypeDecorator):
    """SQLite's DATETIME has no timezone concept — it silently drops tzinfo on
    round-trip, so a value just read back from the DB compares/serializes differently
    from one freshly constructed in Python (naive vs. aware). Every datetime column
    uses this type so every value that comes out of the ORM is tz-aware UTC, full stop:
    safe to subtract, and safe to serialize to the frontend as an unambiguous instant.
    """

    impl = DateTime
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect):
        if value is None:
            return None
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc).replace(tzinfo=None)

    def process_result_value(self, value: datetime | None, dialect):
        if value is None:
            return None
        return value.replace(tzinfo=timezone.utc)


def _utc_column():
    return Column(UTCDateTime)


class DayKind(str, Enum):
    work = "work"
    time_off = "time_off"
    holiday = "holiday"


class DayEntry(SQLModel, table=True):
    __tablename__ = "day_entry"

    date: str = Field(primary_key=True)  # YYYY-MM-DD, in APP_TIMEZONE
    kind: DayKind = Field(default=DayKind.work)

    clock_in: datetime | None = Field(default=None, sa_column=_utc_column())
    clock_out: datetime | None = Field(default=None, sa_column=_utc_column())
    hours: float | None = None  # derived from clock_in/out unless overridden
    hours_overridden: bool = False

    plan_text: str | None = None  # morning to-do, raw
    work_text: str | None = None  # evening description, raw

    project: str | None = None
    task: str | None = None

    summary: str | None = None  # LLM output — what lands in the export
    summary_model: str | None = None
    summary_generated_at: datetime | None = Field(default=None, sa_column=_utc_column())
    edited: bool = False  # true once hand-edited after generation; gates the regenerate warning

    time_off_reason: str | None = None

    created_at: datetime = Field(default_factory=utcnow, sa_column=_utc_column())
    updated_at: datetime = Field(default_factory=utcnow, sa_column=_utc_column())


class AppMeta(SQLModel, table=True):
    __tablename__ = "app_meta"

    key: str = Field(primary_key=True)
    value: str
