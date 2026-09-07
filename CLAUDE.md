# CLAUDE.md — TimeTrack build instructions

Read `plan.md` first — it's the architecture source of truth. This file is the execution
order and the standing rules that apply across every step.

**Do not start building until the user explicitly says to.** This repo's design comes from
Claude Design, handed off via `claude_design_handoff.md`. If `frontend/` has no design
output yet (no `.dc.html` artboards, screenshots, or design spec referenced by the user),
ask where the design lives before writing any screen.

## Stack

- **Backend:** Python, FastAPI, SQLModel (SQLite), pydantic-settings, `anthropic` +
  `openai` SDKs, `openpyxl` for XLSX, `huggingface_hub` for bucket sync.
- **Frontend:** React + TypeScript + Vite, `vite-plugin-pwa`. No heavy UI framework unless
  the design output specifies one — keep the dependency footprint small for a personal app.
- **Deploy:** one Docker image, HF Space, `sdk: docker`, `app_port: 7860`.

## Standing rules (apply to every step, not just the step that introduces them)

1. **The live SQLite file never lives on `/data`.** It lives at `DB_PATH` (`/tmp/...`) on
   local disk. Only whole-file copies touch the bucket mount. See `plan.md` → Persistence
   for why — this is the single most important constraint in the whole app.
2. **All "what day is it" logic goes through `backend/timezone.py`.** Never call
   `datetime.now()` or `date.today()` directly elsewhere in the backend.
3. **The service worker caches the app shell only.** Never cache `/api/*` responses.
4. **Graceful degradation is a feature, not an edge case:** the app must fully function
   with no LLM key set (summarize returns 503, UI falls back to a plain text field) and
   with no bucket mounted (logs a warning, runs local-only).
5. **Never commit secrets.** `.env` is gitignored. Passwords go in as bcrypt hashes only,
   produced by `scripts/hash_password.py`.
6. Match the existing code's idiom as you add to it — don't introduce a second style
   partway through.

## Build order

Work through these in order; each step should leave the app in a runnable state.

### 1. Backend skeleton
`backend/config.py` (pydantic-settings reading every env var in `plan.md`), `backend/main.py`
(FastAPI app, `/api/health`), Dockerfile stub that runs it. Confirm `docker build` + a
health-check curl works before moving on.

### 2. Persistence layer
`backend/db.py`, `backend/models.py` (`DayEntry`, `AppMeta`), `backend/storage.py`
(restore-on-boot, backup-after-write via `.backup()` API, snapshot rotation at
`BACKUP_RETAIN_DAYS`), `scripts/backup.py`, `scripts/restore.py`. Write `tests/test_storage.py`
covering the round-trip. This is the highest-risk part of the app — get it solid and tested
before building features on top of it.

### 3. Auth
`scripts/hash_password.py`, `backend/auth.py` (login, JWT issue/verify, bearer dependency,
in-memory attempt limiter), `backend/routers/auth_routes.py`. `tests/test_auth.py`.

### 4. Entries: CRUD, clock in/out, time off
`backend/timezone.py` first (with `tests/test_timezone.py` — including the 00:30
clock-out-books-to-previous-day case from `plan.md`), then `backend/routers/entries.py`
implementing the full `/api/entries*` surface from `plan.md`.

### 5. LLM summarization
`backend/llm/base.py` (a `Protocol`), `anthropic_provider.py` (default, `claude-haiku-4-5`,
structured JSON output), `openai_provider.py` (confirm the current mini-tier model id before
hardcoding it — don't guess from training data). Wire the `/summarize` endpoint with the
503-on-no-key/failure fallback.

### 6. Export
`export_template.json` at repo root, `backend/export.py` reading it at request time,
`backend/routers/export_routes.py`. `tests/test_export.py` covering column remapping,
time-off rows, and the totals row.

### 7. Frontend scaffold
Vite React TS app, `src/api/` typed client (attaches the bearer token, redirects to login
on 401), `src/auth/` (token storage, route guard).

### 8. Screens
Build to whatever Claude Design produced — pull colours, spacing, and component shapes from
the design output rather than improvising. Order: Login → Today → Calendar → Day detail →
Export. Implement all states called out in `claude_design_handoff.md` (loading, empty,
error, offline, summary-generating, clocked-in-but-not-out).

### 9. PWA + packaging
`vite-plugin-pwa` config (manifest, icons, `display: standalone`, safe-area CSS), finish the
multi-stage Dockerfile (node build stage → python runtime stage serving the built SPA plus
the API), HF Space `README.md` frontmatter.

### 10. Verification pass
Run the full checklist in `plan.md` → Verification: automated tests, the local
restart-survival test, and — once deployed — the Factory-Reboot-survives-with-data test on
the actual Space.

## What "done" looks like for this project

You can open the deployed Space URL on your phone, add it to the homescreen, log in once,
clock in, clock out with a description, see an LLM-generated summary you can edit, mark a
day as time off, see all of it correctly colour-coded on the calendar, export a date range
as XLSX, and — critically — none of that data disappears after the Space restarts or sleeps.
