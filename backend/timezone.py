"""Single source of truth for "what calendar day is it".

Every place in the backend that needs today's date, or needs to convert a timestamp to
the calendar day it belongs to, must go through this module — never call
`datetime.now()` or `date.today()` directly elsewhere. That's what keeps a 00:30
clock-out booking to the correct (previous) working day instead of silently opening a
new one.

Timestamps are stored in UTC everywhere in the database; conversion to/from the app's
local calendar day happens only here, at the edges.
"""

from __future__ import annotations

import calendar
from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

from backend.config import get_settings

DATE_FMT = "%Y-%m-%d"


def app_tz() -> ZoneInfo:
    return ZoneInfo(get_settings().app_timezone)


def utcnow() -> datetime:
    """The current instant, timezone-aware, in UTC. Store this — never a naive datetime."""
    return datetime.now(timezone.utc)


def today_str() -> str:
    """Today's date, as the app's local calendar sees it, formatted YYYY-MM-DD."""
    return utcnow().astimezone(app_tz()).date().strftime(DATE_FMT)


def to_local_date(dt: datetime) -> date:
    """Which local calendar day a UTC (or any tz-aware) timestamp falls on."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(app_tz()).date()


def parse_date_str(s: str) -> date:
    return datetime.strptime(s, DATE_FMT).date()


def date_to_str(d: date) -> str:
    return d.strftime(DATE_FMT)


def month_bounds(year: int, month: int) -> tuple[str, str]:
    """Inclusive (start, end) date strings for a calendar month."""
    start = date(year, month, 1)
    last_day = calendar.monthrange(year, month)[1]
    end = date(year, month, last_day)
    return date_to_str(start), date_to_str(end)
