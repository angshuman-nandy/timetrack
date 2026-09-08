from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from starlette.exceptions import HTTPException as StarletteHTTPException

from backend import db
from backend.routers import activities, auth_routes, entries, export_routes, summary

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
    yield


app = FastAPI(title="TimeTrack", lifespan=lifespan)

app.include_router(auth_routes.router)
app.include_router(entries.router)
app.include_router(activities.router)
app.include_router(summary.router)
app.include_router(export_routes.router)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


# Serve the built frontend SPA, if present (production Docker image). In local dev the
# frontend runs on its own Vite dev server instead, so this is skipped when absent.
_frontend_dist = Path(__file__).resolve().parent.parent / "frontend" / "dist"

# Hashed filenames (index-<hash>.js, the font files) change whenever their content
# does, so they're safe to cache forever. Everything else that names them by a fixed
# URL — index.html, the service worker and its registration script, the manifest —
# must always be revalidated, or a browser can go on serving an old shell that points
# at asset files a later deploy has already deleted (looks like a stuck/broken app).
_NO_CACHE_FILES = {"index.html", "sw.js", "registerSW.js", "manifest.webmanifest"}


class SPAStaticFiles(StaticFiles):
    """Falls back to index.html for any path StaticFiles can't otherwise resolve, so
    client-side routes (e.g. /calendar, /day/2026-09-01) work on a direct load or a
    refresh — not just when reached by an in-app navigation — the same way any other
    SPA-behind-a-web-server setup handles deep links."""

    async def get_response(self, path: str, scope):
        try:
            return await super().get_response(path, scope)
        except StarletteHTTPException as exc:
            if exc.status_code == 404 and not path.startswith("api/"):
                return await super().get_response("index.html", scope)
            raise


if _frontend_dist.is_dir():
    app.mount("/", SPAStaticFiles(directory=str(_frontend_dist), html=True), name="spa")

    @app.middleware("http")
    async def spa_cache_headers(request: Request, call_next):
        response = await call_next(request)
        path = request.url.path
        if path.startswith("/api/"):
            # Belt-and-braces on top of the service worker's own denylist (see
            # vite.config.ts) — API responses must never be cacheable, full stop.
            response.headers["Cache-Control"] = "no-store"
        elif path.startswith("/assets/"):
            response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        elif path.split("/")[-1] in _NO_CACHE_FILES or "." not in path.rsplit("/", 1)[-1]:
            # The last branch covers "/", "/calendar", "/day/2026-09-01" — every
            # client-side route falls back to this same always-revalidate index.html.
            response.headers["Cache-Control"] = "no-cache"
        return response
