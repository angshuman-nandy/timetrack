"""build_provider's automatic fallback chain: OpenAI (gpt-4o-mini) tried first when
configured, Anthropic (Haiku) used if OpenAI isn't configured or its call fails.
Constructing a provider only builds the SDK client — no network call — so these run
fully offline against fake keys.
"""

from __future__ import annotations

import pytest

from backend.config import get_settings
from backend.llm.base import SummaryResult, SummaryUnavailable
from backend.llm.factory import FallbackProvider, build_provider


def test_resolved_models_default_to_gpt4o_mini_and_haiku(isolated_env, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-fake")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-fake")
    get_settings.cache_clear()
    settings = get_settings()

    assert settings.resolved_openai_model == "gpt-4o-mini"
    assert settings.resolved_anthropic_model == "claude-haiku-4-5"


def test_build_provider_prefers_openai_when_both_keys_set(isolated_env, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-fake")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-fake")
    get_settings.cache_clear()

    provider = build_provider(get_settings())
    assert isinstance(provider, FallbackProvider)
    assert provider.model_id == "gpt-4o-mini"


def test_build_provider_returns_openai_alone(isolated_env, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-fake")
    get_settings.cache_clear()

    provider = build_provider(get_settings())
    assert not isinstance(provider, FallbackProvider)
    assert provider.model_id == "gpt-4o-mini"


def test_build_provider_returns_anthropic_alone(isolated_env, monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-fake")
    get_settings.cache_clear()

    provider = build_provider(get_settings())
    assert not isinstance(provider, FallbackProvider)
    assert provider.model_id == "claude-haiku-4-5"


def test_build_provider_raises_when_neither_configured(isolated_env):
    get_settings.cache_clear()
    with pytest.raises(SummaryUnavailable):
        build_provider(get_settings())


def test_fallback_provider_falls_back_when_primary_fails():
    class FailingPrimary:
        model_id = "gpt-4o-mini"

        def summarize(self, **kwargs):
            raise SummaryUnavailable("insufficient_quota")

    class WorkingSecondary:
        model_id = "claude-haiku-4-5"

        def summarize(self, **kwargs):
            return SummaryResult(summary="Did the work via fallback.")

    provider = FallbackProvider(FailingPrimary(), WorkingSecondary())
    result = provider.summarize(plan_text=None, work_text=None, project=None, task=None, hours=None)

    assert result.summary == "Did the work via fallback."
    assert provider.model_id == "claude-haiku-4-5"


def test_fallback_provider_uses_primary_when_it_succeeds():
    class WorkingPrimary:
        model_id = "gpt-4o-mini"

        def summarize(self, **kwargs):
            return SummaryResult(summary="Did the work.")

    class UnusedSecondary:
        model_id = "claude-haiku-4-5"

        def summarize(self, **kwargs):
            raise AssertionError("secondary should not be called when primary succeeds")

    provider = FallbackProvider(WorkingPrimary(), UnusedSecondary())
    result = provider.summarize(plan_text=None, work_text=None, project=None, task=None, hours=None)

    assert result.summary == "Did the work."
    assert provider.model_id == "gpt-4o-mini"
