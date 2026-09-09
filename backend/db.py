"""SQLite engine and schema lifecycle.

The engine always points at DB_PATH (local ephemeral disk) — never at DATA_DIR. See
storage.py for why.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Iterator

from sqlalchemy import inspect, text
from sqlmodel import Session, SQLModel, create_engine

from backend.config import get_settings
from backend import storage

logger = logging.getLogger("timetrack.db")

_engine = None

# SQLModel.metadata.create_all() only creates tables that don't exist yet — it never
# alters an existing one. The live DB is a bucket-restored file that can be from an
# older schema version, so a column added to a table that already shipped needs an
# explicit entry here, or every query touching that table breaks with "no such
# column" the moment the app reads/writes it. Append to this list, never edit or
# remove a past entry (it must stay correct against every schema version still out
# there in someone's bucket).
_COLUMN_MIGRATIONS: list[tuple[str, str, str]] = [
    ("day_entry", "paused_at", "ALTER TABLE day_entry ADD COLUMN paused_at DATETIME"),
    ("day_entry", "break_seconds", "ALTER TABLE day_entry ADD COLUMN break_seconds FLOAT DEFAULT 0.0"),
    ("day_entry", "location", "ALTER TABLE day_entry ADD COLUMN location VARCHAR"),
    ("day_entry", "deliverable", "ALTER TABLE day_entry ADD COLUMN deliverable VARCHAR"),
    ("day_entry", "category", "ALTER TABLE day_entry ADD COLUMN category VARCHAR"),
    ("day_entry", "status", "ALTER TABLE day_entry ADD COLUMN status VARCHAR"),
    ("day_entry", "remarks", "ALTER TABLE day_entry ADD COLUMN remarks VARCHAR"),
]


def get_engine():
    global _engine
    if _engine is None:
        settings = get_settings()
        Path(settings.db_path).parent.mkdir(parents=True, exist_ok=True)
        _engine = create_engine(
            f"sqlite:///{settings.db_path}",
            connect_args={"check_same_thread": False},
        )
    return _engine


def _apply_column_migrations(engine) -> None:
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    with engine.begin() as conn:
        for table, column, ddl in _COLUMN_MIGRATIONS:
            if table not in existing_tables:
                continue  # a fresh DB — create_all() below creates it with every
                # current column, so there's nothing to migrate.
            existing_columns = {c["name"] for c in inspector.get_columns(table)}
            if column not in existing_columns:
                conn.execute(text(ddl))
                logger.warning("Schema migration: added column %s.%s", table, column)


def init_db() -> None:
    """Call once at app startup: restore the durable copy (if any), migrate its schema
    forward if it's from an older version of the app, then ensure the schema exists
    on whatever DB we ended up with (covers a genuinely fresh DB, and any brand-new
    table create_all() alone is enough for)."""
    storage.restore_on_boot()
    engine = get_engine()
    _apply_column_migrations(engine)
    SQLModel.metadata.create_all(engine)
    logger.info("Database ready at %s", get_settings().db_path)


def get_session() -> Iterator[Session]:
    """FastAPI dependency — one Session per request."""
    with Session(get_engine()) as session:
        yield session
