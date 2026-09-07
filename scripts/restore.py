#!/usr/bin/env python3
"""Manually restore the local DB (DB_PATH) from the durable copy in DATA_DIR. The app
does this automatically on startup — this is for restoring into a running dev instance
without a restart.

Usage: python scripts/restore.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend import storage  # noqa: E402


def main() -> None:
    restored = storage.restore_on_boot()
    if restored:
        print("Restored from DATA_DIR.")
    else:
        print("Nothing restored — either DATA_DIR isn't mounted, or no backup exists yet.")


if __name__ == "__main__":
    main()
