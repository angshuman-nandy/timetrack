#!/usr/bin/env python3
"""Manually trigger a backup of the live DB to DATA_DIR. Same function the app calls
after every mutating request — this is for a synchronous checkpoint around a deploy.

Usage: python scripts/backup.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend import storage  # noqa: E402


def main() -> None:
    ok = storage.backup_now()
    if ok:
        print("Backup written to DATA_DIR.")
    else:
        print("DATA_DIR is not mounted — nothing to back up to. See the warning above.")
        sys.exit(1)


if __name__ == "__main__":
    main()
