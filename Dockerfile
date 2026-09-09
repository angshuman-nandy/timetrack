# --- Stage 1: build the frontend ---
FROM node:22-slim AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# --- Stage 2: python runtime, serving the built SPA + API from one process ---
FROM python:3.12-slim
WORKDIR /app

# HF Spaces run containers as a non-root user by convention; create one so the app
# doesn't need root and any files it writes locally (DB_PATH) aren't root-owned.
RUN useradd -m -u 1000 appuser

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./backend/
COPY export_template.json ./export_template.json
COPY consultant_template.json ./consultant_template.json
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

# Defaults match .env.example; HF Space secrets override these at deploy time.
ENV DB_PATH=/tmp/timetrack.db \
    DATA_DIR=/data \
    APP_TIMEZONE=Asia/Kolkata \
    PYTHONUNBUFFERED=1

# Deliberately NOT pre-creating /data: its absence is what tells storage.py no bucket
# is mounted and to warn + run local-only. Pre-creating it here would mask a Space
# that's missing its volume mount into looking durable when it isn't.
RUN chown -R appuser:appuser /app
USER appuser

# HF Docker Spaces route to this port by convention.
EXPOSE 7860

CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "7860"]
