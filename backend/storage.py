"""Durable persistence for the SQLite database, across an object-storage bucket mount.

The mount at DATA_DIR (an HF Storage Bucket in production) is NOT a block device: writes
land on file close, reads can be stale for ~10s, and file locks aren't coordinated across
it. SQLite depends on none of that being true, so **no sqlite3.Connection is ever opened
against a path under DATA_DIR** — every operation there is a single sequential whole-file
copy (open, write bytes, close), which is exactly the access pattern object storage is
built for.

Flow:
  - `restore_on_boot()` — copy DATA_DIR/timetrack.db down to local disk (DB_PATH), if one
    exists, before the DB engine ever opens it.
  - `backup_now()` — run SQLite's online `.backup()` API entirely between two *local*
    files, then push the resulting local file to DATA_DIR in one sequential copy. Called
    after every mutating request.
  - Daily snapshots under DATA_DIR/snapshots/ give a manual rollback point, since buckets
    are non-versioned (a bad overwrite has no history to recover from otherwise).

If DATA_DIR isn't mounted (local dev), everything here becomes a no-op after one warning
log line, and the app runs local-only.
"""

from __future__ import annotations

import logging
import os
import shutil
import sqlite3
import tempfile
from pathlib import Path

from backend.config import get_settings
from backend.timezone import utcnow

logger = logging.getLogger("timetrack.storage")

_warned_no_data_dir = False


def _data_dir_available() -> bool:
    global _warned_no_data_dir
    data_dir = Path(get_settings().data_dir)
    if data_dir.is_dir():
        return True
    if not _warned_no_data_dir:
        logger.warning(
            "DATA_DIR %s is not mounted — running LOCAL-ONLY. Data will NOT survive a "
            "container restart. Attach a Storage Bucket read-write at this path in the "
            "Space's settings for production use.",
            data_dir,
        )
        _warned_no_data_dir = True
    return False


def _bucket_db_path() -> Path:
    return Path(get_settings().data_dir) / "timetrack.db"


def _snapshot_dir() -> Path:
    return Path(get_settings().data_dir) / "snapshots"


def restore_on_boot() -> bool:
    """Copy the durable DB down to local disk, if one exists. Call once at startup,
    before the DB engine is created. Returns True if a database was restored."""
    settings = get_settings()
    if not _data_dir_available():
        return False

    src = _bucket_db_path()
    if not src.exists():
        logger.info("No existing database at %s — starting fresh.", src)
        return False

    dst = Path(settings.db_path)
    dst.parent.mkdir(parents=True, exist_ok=True)
    # A single sequential read-then-write — safe against the mount's access pattern.
    shutil.copyfile(src, dst)
    logger.info("Restored database from %s (%d bytes)", src, src.stat().st_size)
    return True


def _local_backup_copy(local_db_path: str) -> Path:
    """Run SQLite's online backup API between two local files (both off the mount) and
    return the path to the resulting local copy. Safe to call while the live DB is open."""
    fd, tmp_name = tempfile.mkstemp(prefix="timetrack-backup-", suffix=".db")
    os.close(fd)
    tmp_path = Path(tmp_name)

    src_conn = sqlite3.connect(local_db_path)
    try:
        dst_conn = sqlite3.connect(tmp_path)
        try:
            src_conn.backup(dst_conn)
        finally:
            dst_conn.close()
    finally:
        src_conn.close()

    return tmp_path


def _push_to_mount(local_copy: Path, dest: Path) -> None:
    """Push one local file to a path under DATA_DIR as a single sequential write.
    Writes to a sibling temp name first and attempts an atomic rename; if the mount
    doesn't support rename, falls back to a direct overwrite copy."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp_dest = dest.with_name(dest.name + ".tmp")
    shutil.copyfile(local_copy, tmp_dest)
    try:
        os.replace(tmp_dest, dest)
    except OSError:
        # Some object-storage mounts don't support rename; fall back to a direct
        # overwrite (buckets are documented as mutable/overwrite-in-place).
        shutil.copyfile(tmp_dest, dest)
        tmp_dest.unlink(missing_ok=True)


def backup_now() -> bool:
    """Write a consistent whole-file copy of the live DB to DATA_DIR. Returns True if a
    backup was written (False if DATA_DIR isn't mounted, or the sync failed).

    Deliberately never raises: the caller (a mutating API route) has already committed
    the write to local SQLite by the time this runs, so a transient bucket I/O or
    permission problem must not fail the user's request — it's logged and surfaced as a
    degraded sync, not a lost write. The data lives on local disk either way; only the
    next successful sync (or a restart before one happens) is at risk.
    """
    if not _data_dir_available():
        return False

    settings = get_settings()
    try:
        local_copy = _local_backup_copy(settings.db_path)
    except Exception:
        logger.exception("Local backup copy failed — DB may be locked or disk full.")
        return False

    try:
        _push_to_mount(local_copy, _bucket_db_path())
        _write_snapshot_if_needed(local_copy)
        _prune_old_snapshots()
    except OSError:
        logger.exception(
            "Backup sync to DATA_DIR %s failed — check the bucket mount's permissions. "
            "The local database is unaffected; this write just isn't durable yet.",
            get_settings().data_dir,
        )
        return False
    finally:
        local_copy.unlink(missing_ok=True)
    return True


def _write_snapshot_if_needed(local_copy: Path) -> None:
    today = utcnow().strftime("%Y-%m-%d")
    snap_path = _snapshot_dir() / f"timetrack-{today}.db"
    if snap_path.exists():
        return  # one snapshot per calendar day
    _push_to_mount(local_copy, snap_path)
    logger.info("Wrote daily snapshot %s", snap_path)


def _prune_old_snapshots() -> None:
    settings = get_settings()
    snap_dir = _snapshot_dir()
    if not snap_dir.is_dir():
        return
    snapshots = sorted(snap_dir.glob("timetrack-*.db"))  # filename sorts chronologically
    excess = len(snapshots) - settings.backup_retain_days
    for old in snapshots[: max(0, excess)]:
        old.unlink(missing_ok=True)
