"""SQLite engine and schema lifecycle.

The engine always points at DB_PATH (local ephemeral disk) — never at DATA_DIR. See
storage.py for why.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Iterator

from sqlmodel import Session, SQLModel, create_engine

from backend.config import get_settings
from backend import storage

logger = logging.getLogger("timetrack.db")

_engine = None


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


def init_db() -> None:
    """Call once at app startup: restore the durable copy (if any), then ensure the
    schema exists on whatever DB we ended up with."""
    storage.restore_on_boot()
    SQLModel.metadata.create_all(get_engine())
    logger.info("Database ready at %s", get_settings().db_path)


def get_session() -> Iterator[Session]:
    """FastAPI dependency — one Session per request."""
    with Session(get_engine()) as session:
        yield session
