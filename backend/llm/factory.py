from __future__ import annotations

from backend.config import Settings
from backend.llm.base import SummaryProvider, SummaryUnavailable


def build_provider(settings: Settings) -> SummaryProvider:
    if not settings.llm_configured:
        raise SummaryUnavailable(
            "No LLM provider is configured (set ANTHROPIC_API_KEY, or OPENAI_API_KEY "
            "plus LLM_MODEL)."
        )

    if settings.llm_provider == "anthropic":
        from backend.llm.anthropic_provider import AnthropicProvider

        return AnthropicProvider(settings.anthropic_api_key, settings.resolved_llm_model)

    if settings.llm_provider == "openai":
        from backend.llm.openai_provider import OpenAIProvider

        return OpenAIProvider(settings.openai_api_key, settings.resolved_llm_model)

    raise SummaryUnavailable(f"Unknown LLM_PROVIDER: {settings.llm_provider}")
