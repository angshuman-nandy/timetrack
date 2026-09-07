"""Single source of truth for environment configuration.

Every other module reads settings from here, never from `os.environ` directly, so the
env contract stays in one documented place (see `.env.example` at the repo root for the
full list with explanations).
"""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",  # the .env also holds deployment-only vars (GIT_REPO_URL, etc.)
        str_strip_whitespace=True,  # a trailing newline from copy-pasting into a
        # secrets UI (HF Space secrets, etc.) is a common real-world source of "the
        # value is right but doesn't match" bugs — strip it at the source.
    )

    # --- Auth ---
    auth_username: str = ""
    auth_password_hash: str = ""
    jwt_secret: str = ""

    # --- Timezone ---
    app_timezone: str = "Asia/Kolkata"

    # --- LLM ---
    # Automatic fallback chain, not a manual switch: OpenAI (gpt-4o-mini) is tried
    # first when configured, and Anthropic (Haiku) is used if OpenAI has no key, has
    # no credit, or the call otherwise fails. Either key alone is also enough to run.
    anthropic_api_key: str = ""
    anthropic_model: str = ""  # optional override; default is claude-haiku-4-5
    openai_api_key: str = ""
    openai_model: str = ""  # optional override; default is gpt-4o-mini

    # --- Persistence ---
    db_path: str = "/tmp/timetrack.db"
    data_dir: str = "/data"
    backup_retain_days: int = 14

    @property
    def resolved_openai_model(self) -> str:
        return self.openai_model or "gpt-4o-mini"

    @property
    def resolved_anthropic_model(self) -> str:
        return self.anthropic_model or "claude-haiku-4-5"

    @property
    def auth_configured(self) -> bool:
        return bool(self.auth_username and self.auth_password_hash and self.jwt_secret)

    @property
    def llm_configured(self) -> bool:
        return bool(self.openai_api_key or self.anthropic_api_key)


@lru_cache
def get_settings() -> Settings:
    return Settings()
