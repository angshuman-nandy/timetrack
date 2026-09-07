from __future__ import annotations

import logging

from backend.config import Settings
from backend.llm.base import SummaryProvider, SummaryResult, SummaryUnavailable

logger = logging.getLogger("timetrack.llm.factory")


class FallbackProvider:
    """Tries `primary` first; if it raises SummaryUnavailable — no credit, a rate
    limit, or any other failed call — retries once against `secondary`. This is the
    "gpt-4o-mini by default, Haiku if OpenAI isn't available" chain: both providers
    are cheap enough that a silent one-time retry costs nothing and keeps the app
    usable without surfacing a 503 the first time OpenAI hiccups.

    `model_id` is read by routers *after* summarize() returns (for `summary_model`
    audit), so it's updated in place to whichever provider actually produced the
    result rather than fixed at construction time.
    """

    def __init__(self, primary: SummaryProvider, secondary: SummaryProvider) -> None:
        self._primary = primary
        self._secondary = secondary
        self.model_id = primary.model_id

    def summarize(self, **kwargs) -> SummaryResult:
        try:
            result = self._primary.summarize(**kwargs)
            self.model_id = self._primary.model_id
            return result
        except SummaryUnavailable as exc:
            logger.warning(
                "Primary LLM provider (%s) failed, falling back to %s: %s",
                self._primary.model_id,
                self._secondary.model_id,
                exc,
            )

        result = self._secondary.summarize(**kwargs)
        self.model_id = self._secondary.model_id
        return result


def build_provider(settings: Settings) -> SummaryProvider:
    openai_provider = None
    anthropic_provider = None

    if settings.openai_api_key:
        from backend.llm.openai_provider import OpenAIProvider

        openai_provider = OpenAIProvider(settings.openai_api_key, settings.resolved_openai_model)

    if settings.anthropic_api_key:
        from backend.llm.anthropic_provider import AnthropicProvider

        anthropic_provider = AnthropicProvider(
            settings.anthropic_api_key, settings.resolved_anthropic_model
        )

    if openai_provider and anthropic_provider:
        return FallbackProvider(openai_provider, anthropic_provider)
    if openai_provider:
        return openai_provider
    if anthropic_provider:
        return anthropic_provider

    raise SummaryUnavailable(
        "No LLM provider is configured (set OPENAI_API_KEY and/or ANTHROPIC_API_KEY)."
    )
