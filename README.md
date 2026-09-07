---
title: TimeTrack
emoji: ⏱️
colorFrom: yellow
colorTo: gray
sdk: docker
app_port: 7860
pinned: false
---

# TimeTrack

A single-page, mobile-first PWA for logging billable work hours: clock in/out, an
LLM-drafted summary of the day, time-off tracking, a calendar view, and date-range
export to XLSX/CSV. Built to be added to a phone homescreen for quick access.

See `plan.md` for the full architecture and `CLAUDE.md` for build/maintenance notes.

## Persistence

Data survives Space restarts/sleep via an HF Storage Bucket mounted read-write at
`/data` (Space settings → Storage). The live SQLite database itself runs on local
ephemeral disk (`/tmp`) and is synced to the bucket as a whole-file copy after every
write — see `plan.md` → Persistence for why. **Without a bucket attached at `/data`,
the app still runs, but logs a startup warning and data will not survive a restart.**

## Configuration

All required environment variables are documented in `.env.example`. Set the same keys
as this Space's secrets (Settings → Variables and secrets) before relying on it for
real timesheet data — in particular `AUTH_USERNAME`, `AUTH_PASSWORD_HASH` (generate with
`python scripts/hash_password.py`), and `JWT_SECRET`.
