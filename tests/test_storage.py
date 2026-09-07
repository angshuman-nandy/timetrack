"""Proves the persistence design: backup-then-restore preserves every row, snapshots are
written and pruned correctly, and the app degrades gracefully with no DATA_DIR mounted."""

from __future__ import annotations

from sqlmodel import Session, select

from backend import db, storage
from backend.models import DayEntry, DayKind


def test_backup_then_restore_round_trip(isolated_env):
    db._engine = None  # force a fresh engine bound to this test's DB_PATH
    db.init_db()

    with Session(db.get_engine()) as session:
        session.add(DayEntry(date="2026-09-01", kind=DayKind.work, hours=8.0, project="Acme"))
        session.add(DayEntry(date="2026-09-02", kind=DayKind.time_off, time_off_reason="Sick"))
        session.commit()

    assert storage.backup_now() is True
    assert (isolated_env["data_dir"] / "timetrack.db").exists()

    # Simulate a container restart: wipe local disk, force a new engine, restore.
    isolated_env["db_path"].unlink()
    db._engine = None
    restored = storage.restore_on_boot()
    assert restored is True

    db._engine = None
    with Session(db.get_engine()) as session:
        rows = session.exec(select(DayEntry).order_by(DayEntry.date)).all()

    assert [r.date for r in rows] == ["2026-09-01", "2026-09-02"]
    assert rows[0].hours == 8.0
    assert rows[0].project == "Acme"
    assert rows[1].kind == DayKind.time_off
    assert rows[1].time_off_reason == "Sick"


def test_snapshot_written_once_per_day(isolated_env):
    db._engine = None
    db.init_db()
    storage.backup_now()
    storage.backup_now()  # second call same day should not create a second snapshot

    snapshots = list((isolated_env["data_dir"] / "snapshots").glob("timetrack-*.db"))
    assert len(snapshots) == 1


def test_no_data_dir_is_a_safe_no_op(isolated_env, monkeypatch):
    from backend.config import get_settings

    monkeypatch.setenv("DATA_DIR", str(isolated_env["data_dir"] / "does-not-exist"))
    get_settings.cache_clear()

    db._engine = None
    db.init_db()  # must not raise even though DATA_DIR is missing
    assert storage.backup_now() is False


def test_backup_failure_is_swallowed_not_raised(isolated_env, monkeypatch):
    """A permission error or transient I/O failure writing to the mount (e.g. a bucket
    mount owned by a different uid) must degrade to a logged, returned False — never an
    exception that would fail the caller's already-committed request."""
    db._engine = None
    db.init_db()

    def boom(*args, **kwargs):
        raise OSError("Permission denied (simulated bucket mount failure)")

    monkeypatch.setattr(storage, "_push_to_mount", boom)

    assert storage.backup_now() is False  # must not raise
