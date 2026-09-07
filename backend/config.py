"""Single source of truth for environment configuration.

Every other module reads settings from here, never from `os.environ` directly, so the
env contract stays in one documented place (see `.env.example` at the repo root for the
full list with explanations).
"""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",  # the .env also holds deployment-only vars (GIT_REPO_URL, etc.)
    )

    # --- Auth ---
    auth_username: str = ""
    auth_password_hash: str = ""
    jwt_secret: str = ""

    # --- Timezone ---
    app_timezone: str = "Asia/Kolkata"

    # --- LLM ---
    llm_provider: Literal["anthropic", "openai"] = "anthropic"
    anthropic_api_key: str = ""
    openai_api_key: str = ""
    llm_model: str = ""

    # --- Persistence ---
    db_path: str = "/tmp/timetrack.db"
    data_dir: str = "/data"
    backup_retain_days: int = 14

    @property
    def default_llm_model(self) -> str:
        """The model id to use when LLM_MODEL is not set, per provider."""
        if self.llm_provider == "anthropic":
            return "claude-haiku-4-5"
        # No safe default for OpenAI — model names on that side move fast and a wrong
        # guess fails silently expensive or not at all. Require it explicitly.
        return self.llm_model

    @property
    def resolved_llm_model(self) -> str:
        return self.llm_model or self.default_llm_model

    @property
    def auth_configured(self) -> bool:
        return bool(self.auth_username and self.auth_password_hash and self.jwt_secret)

    @property
    def llm_configured(self) -> bool:
        if self.llm_provider == "anthropic":
            return bool(self.anthropic_api_key)
        if self.llm_provider == "openai":
            return bool(self.openai_api_key and self.llm_model)
        return False


@lru_cache
def get_settings() -> Settings:
    return Settings()
