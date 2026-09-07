#!/usr/bin/env python3
"""Generate a bcrypt hash for AUTH_PASSWORD_HASH. Run this locally and paste the output
into .env / HF Space secrets — the plaintext password itself should never be typed into
a secrets UI or committed anywhere.

Usage: python scripts/hash_password.py
"""

import getpass

import bcrypt


def main() -> None:
    password = getpass.getpass("Password to hash: ")
    confirm = getpass.getpass("Confirm: ")
    if password != confirm:
        print("Passwords didn't match.")
        raise SystemExit(1)
    if len(password) < 8:
        print("Use at least 8 characters — this guards a public URL.")
        raise SystemExit(1)

    hashed = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt())
    print("\nAUTH_PASSWORD_HASH=" + hashed.decode("utf-8"))


if __name__ == "__main__":
    main()
