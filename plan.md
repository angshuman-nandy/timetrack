# TimeTrack — Architecture Plan

A single-page, mobile-first PWA for logging billable work hours: clock in/out, optional
plan/summary text turned into a client-ready description by a small LLM, time-off tracking,
a calendar view, and date-range export to XLSX/CSV. Deploys as one Docker Space on
Hugging Face's free tier.

## Why this shape

Free HF Spaces wipe the container filesystem on restart and auto-sleep after ~48h idle.
The persistence design exists to survive that with zero manual steps between deploys.
Everything else follows normal FastAPI + React conventions.

---

## Persistence

HF **Storage Buckets** (shipped March 2026) mount read-write into a Space container and are
free-tier eligible — HF's own recommended persistence path. But the mount is object storage,
not a block device: writes land **on file close**, reads can be **stale up to ~10s**, and
file locks are **not coordinated across the mount**. SQLite depends on all three (random
in-place writes, `-wal`/`-journal` sidecars, real locking), so the live `.db` file must
never sit directly on the mount.

Design:

- `DB_PATH=/tmp/timetrack.db` — SQLite lives on the container's local ephemeral disk. Full
  POSIX semantics, correct and fast.
- `DATA_DIR=/data` — the mounted bucket. Holds only whole-file copies, never opened for
  random access.
- **Boot:** if `/data/timetrack.db` exists, copy it to `DB_PATH`; else create a fresh schema.
- **After every mutating request:** SQLite's online `.backup()` API writes to a temp file,
  then an atomic move replaces `/data/timetrack.db`. One whole-file write-on-close per
  mutation — exactly the access pattern the mount is built for. At ~2 writes/day this costs
  nothing.
- **Snapshots:** buckets are non-versioned (deletes are permanent, no history), so each sync
  also writes a dated copy to `/data/snapshots/timetrack-YYYY-MM-DD.db`, pruned to the last
  `BACKUP_RETAIN_DAYS` (default 14) — a manual rollback point if a bad write ever lands.
  Only one snapshot is created per calendar day.
- **No bucket mounted (local dev):** log a loud warning once at boot and run local-only;
  the app must still fully function.
- `scripts/backup.py` / `scripts/restore.py` wrap the same `storage.py` functions as CLI
  commands, for manual use around a deploy if you ever want a synchronous checkpoint.

A single free-tier replica means there's no concurrent-writer problem to solve.

---

## Repo layout

```
timetrack/
├── Dockerfile              # multi-stage: node build → python runtime, EXPOSE 7860
├── README.md               # HF Space YAML frontmatter (sdk: docker, app_port: 7860)
├── .env.example             # documents every key; .env itself is gitignored
├── .gitignore
├── export_template.json    # client column mapping — edit this file to match their format
├── backend/
│   ├── main.py              # FastAPI app: mounts /api routers + serves built SPA
│   ├── config.py            # pydantic-settings: reads all env vars once, typed
│   ├── auth.py               # login, JWT issue/verify, FastAPI bearer dependency
│   ├── db.py                 # SQLModel engine, schema init/migration-on-boot, restore-on-boot
│   ├── storage.py            # bucket sync: restore(), backup(), snapshot rotation
│   ├── models.py              # DayEntry, AppMeta SQLModel tables
│   ├── timezone.py            # single source of truth for "what calendar day is it"
│   ├── export.py               # reads export_template.json, writes xlsx (openpyxl) + csv
│   ├── routers/
│   │   ├── auth_routes.py
│   │   ├── entries.py          # CRUD, clock-in/out, time-off
│   │   └── export_routes.py
│   └── llm/
│       ├── base.py             # Provider protocol: summarize(plan, work, project, task, hours) -> Summary
│       ├── anthropic_provider.py
│       └── openai_provider.py
├── scripts/
│   ├── backup.py
│   ├── restore.py
│   └── hash_password.py        # generates AUTH_PASSWORD_HASH for .env — no plaintext ever stored
├── tests/
│   ├── test_auth.py
│   ├── test_timezone.py
│   ├── test_export.py
│   └── test_storage.py
└── frontend/
    ├── vite.config.ts           # vite-plugin-pwa config
    ├── public/                  # icons: 192/512 maskable + apple-touch-icon
    └── src/
        ├── api/                 # typed fetch client, attaches bearer token
        ├── auth/                 # login state, token storage, route guard
        ├── pages/                 # Login, Today, Calendar, DayDetail, Export
        └── components/
```

---

## Data model

**`day_entry`** — primary key `date` (`YYYY-MM-DD`, in `APP_TIMEZONE`):

| Field | Type | Notes |
|---|---|---|
| `date` | str (PK) | |
| `kind` | enum | `work` \| `time_off` \| `holiday` |
| `clock_in` | datetime? | UTC-stored, local-displayed |
| `clock_out` | datetime? | |
| `hours` | float | derived from clock_in/out, user-overridable |
| `plan_text` | str? | morning to-do, raw input |
| `work_text` | str? | evening description, raw input |
| `project` | str? | |
| `task` | str? | |
| `summary` | str? | LLM output — what actually lands in the exported timesheet |
| `summary_model` | str? | which provider/model produced it, for audit |
| `summary_generated_at` | datetime? | |
| `edited` | bool | set true on any manual edit after generation; regenerate warns before overwrite |
| `time_off_reason` | str? | populated when `kind != work` |
| `created_at` / `updated_at` | datetime | |

**`app_meta`** — key/value: `schema_version`, `last_backup_at`.

**`activity`** — the activity board: short one-liners logged against a date over the
course of a day, added from Today (while clocked in) or Day detail (editing a past day).
The full list for a date is what gets fed to the LLM at clock-out/summarize, replacing a
single end-of-day textarea.

| Field | Type | Notes |
|---|---|---|
| `id` | int (PK) | |
| `date` | str | `YYYY-MM-DD`, same key space as `day_entry.date` |
| `text` | str | one activity, e.g. "Reviewed PR #412" |
| `created_at` | datetime | UTC-stored; formatted `HH:MM` in `APP_TIMEZONE` for display/prompt |

Deleting a `day_entry`, or converting it to `time_off`/`holiday`, cascades to delete that
date's activities — they only make sense against a worked day.

---

## API

```
POST   /api/auth/login              {username, password} → {token}
GET    /api/auth/me
GET    /api/entries?start=&end=     list for calendar/export range
GET    /api/entries/{date}
POST   /api/clock-in                {date?, plan_text?}     date defaults to "today" in APP_TIMEZONE
POST   /api/clock-out               {date?, work_text?}
PATCH  /api/entries/{date}          partial update of any field
DELETE /api/entries/{date}
POST   /api/entries/{date}/time-off {kind, reason}
POST   /api/entries/bulk-kind       {dates: [], kind, reason} → mark many days at once
                                     (calendar multi-select); one commit + one bucket
                                     sync for the whole batch
POST   /api/entries/{date}/summarize
GET    /api/entries/{date}/activities
POST   /api/entries/{date}/activities   {text}
DELETE /api/activities/{id}
DELETE /api/entries/{date}/activities   clear the whole board for a date
GET    /api/export?start=&end=&format=xlsx|csv
GET    /api/health                  no auth; used by Docker/HF health checks
```

`PATCH /api/entries/{date}` upserts: a date with no row yet creates one (Calendar → tap a
blank past day → fill in hours by hand). A patch that includes `kind` goes through the
same "switching kind clears work-only fields and the activity board" path as the
dedicated `/time-off` endpoint.

All routes but `login` and `health` require `Authorization: Bearer <JWT>`.

---

## Auth

Single user, credentials only ever in HF Space secrets — never in the repo.

- `AUTH_USERNAME` — plain string.
- `AUTH_PASSWORD_HASH` — bcrypt hash, produced locally by `scripts/hash_password.py` so the
  plaintext password never has to be typed into a secrets UI.
- `JWT_SECRET` — signs HS256 tokens, 30-day expiry, stored in the PWA's `localStorage` so
  reopening from the homescreen doesn't require logging in again.
- A small in-memory failed-attempt limiter on `/api/auth/login` (the Space URL is public).

---

## Timezone

`APP_TIMEZONE` (default `Asia/Kolkata`) is the single source of truth for "what day is it."
All day-bucketing — clock-in defaulting to today, clock-out closing the right day, calendar
month boundaries — routes through `backend/timezone.py`. This matters concretely: a clock-out
at 00:30 must still close out *yesterday's* work day, not open a new one. Timestamps are
stored in UTC and converted at the edges.

---

## LLM summarization

`POST /api/entries/{date}/summarize` sends `plan_text`, `work_text`, `project`, `task`,
`hours` and requests structured JSON back: `{summary, suggested_project, suggested_task}`.

- **Automatic fallback chain, not a manual switch:** `OPENAI_API_KEY` set → OpenAI
  (`gpt-4o-mini` by default) is tried first. If that call fails for any reason — no
  credit, a rate limit, any other error — it retries once against Anthropic
  (`claude-haiku-4-5` by default) if `ANTHROPIC_API_KEY` is also set. Either key alone is
  enough to run; see `backend/llm/factory.py`'s `FallbackProvider`.
- **No key configured, or every configured provider fails:** the endpoint returns a clear
  503; the UI falls back to a plain editable text field. The app is fully usable with zero
  LLM spend.
- A generated summary is always a draft — editing it sets `edited=true`, and regenerating
  over an edited summary asks for confirmation first.

---

## Export

`export_template.json` at the repo root is the only file you touch to match the client's
real format later — no code change needed for a reorder, rename, or added column:

```json
{
  "date_format": "%d-%m-%Y",
  "include_kinds": ["work", "time_off"],
  "columns": [
    {"header": "Date",        "field": "date"},
    {"header": "Project",     "field": "project"},
    {"header": "Task",        "field": "task"},
    {"header": "Description", "field": "summary"},
    {"header": "Hours",       "field": "hours"}
  ],
  "totals_row": true
}
```

`backend/export.py` reads this file at request time (no restart needed after an edit) and
emits both `.xlsx` (via `openpyxl`) and `.csv`. Time-off days export with `hours=0` and the
reason in the description column, so leave is visible in the sheet.

---

## PWA

`vite-plugin-pwa`, `display: "standalone"`, maskable 192px/512px icons plus
`apple-touch-icon` and `apple-mobile-web-app-capable` meta tags for correct iOS
add-to-homescreen behavior. The service worker caches **the app shell only** — never API
responses. A stale cached timesheet is worse than an honest "you're offline" banner.

---

## Environment (`.env` / HF Space secrets)

```
AUTH_USERNAME=
AUTH_PASSWORD_HASH=
JWT_SECRET=

APP_TIMEZONE=Asia/Kolkata

OPENAI_API_KEY=
OPENAI_MODEL=
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=

DATA_DIR=/data
DB_PATH=/tmp/timetrack.db
BACKUP_RETAIN_DAYS=14
```

`.env` itself is gitignored; `.env.example` documents every key with no values.

---

## Verification

**Automated (`pytest`, backend):**
- auth — wrong password rejected; expired/forged JWT rejected; protected routes 401 without
  a bearer token
- timezone — a 00:30 clock-out under `Asia/Kolkata` books to the previous calendar day
- export — column reorder/rename in the template is honored; time-off rows show 0 hours;
  totals row sums correctly
- storage — backup-then-restore round-trip preserves every row exactly

**Manual, local:**
- `docker build .` then run on port 7860: log in, clock in, clock out, generate a summary
  with a real API key, export both XLSX and CSV
- restart-survival: `rm /tmp/timetrack.db` inside the running container, restart it, confirm
  data reappears from `DATA_DIR`
- confirm the app still loads and works with no `ANTHROPIC_API_KEY`/`OPENAI_API_KEY` set

**On the deployed Space:**
- create the bucket, attach it read-write at `/data` in Space settings, set all secrets
- deploy, create an entry, then **Factory Reboot** the Space and confirm the entry survived
  — this is the test that actually proves the persistence design end-to-end
- add to homescreen on your phone; confirm standalone launch (no browser chrome) and that
  login persists across app restarts
