"""The single most likely source of wrong-day bugs in a billing app: does a late-night
clock-out book to the correct calendar day under APP_TIMEZONE?"""

from __future__ import annotations

from datetime import datetime, timezone

from backend.timezone import month_bounds, to_local_date


def test_late_night_utc_timestamp_books_to_previous_local_day(isolated_env):
    # 00:30 IST on 2026-09-08 is 19:00 UTC on 2026-09-07 (IST = UTC+5:30).
    utc_ts = datetime(2026, 9, 7, 19, 0, tzinfo=timezone.utc)
    assert to_local_date(utc_ts).isoformat() == "2026-09-08"

    # And the boundary case: 18:29 UTC on 2026-09-07 is still 2026-09-07 in IST.
    just_before = datetime(2026, 9, 7, 18, 29, tzinfo=timezone.utc)
    assert to_local_date(just_before).isoformat() == "2026-09-07"


def test_naive_datetime_is_treated_as_utc(isolated_env):
    naive = datetime(2026, 9, 7, 19, 0)  # no tzinfo
    assert to_local_date(naive).isoformat() == "2026-09-08"


def test_month_bounds_handles_december(isolated_env):
    start, end = month_bounds(2026, 12)
    assert start == "2026-12-01"
    assert end == "2026-12-31"


def test_month_bounds_handles_february_leap_year(isolated_env):
    start, end = month_bounds(2028, 2)
    assert end == "2028-02-29"
