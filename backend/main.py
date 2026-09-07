from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from pathlib import Path

from backend import db
from backend.routers import auth_routes, entries, export_routes, summary

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
    yield


app = FastAPI(title="TimeTrack", lifespan=lifespan)

app.include_router(auth_routes.router)
app.include_router(entries.router)
app.include_router(summary.router)
app.include_router(export_routes.router)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


# Serve the built frontend SPA, if present (production Docker image). In local dev the
# frontend runs on its own Vite dev server instead, so this is skipped when absent.
_frontend_dist = Path(__file__).resolve().parent.parent / "frontend" / "dist"
if _frontend_dist.is_dir():
    app.mount("/", StaticFiles(directory=str(_frontend_dist), html=True), name="spa")
