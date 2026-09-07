from __future__ import annotations

import logging

import anthropic

from backend.llm.base import SummaryResult, SummaryUnavailable, build_prompt

logger = logging.getLogger("timetrack.llm.anthropic")


class AnthropicProvider:
    def __init__(self, api_key: str, model_id: str) -> None:
        self.model_id = model_id
        self._client = anthropic.Anthropic(api_key=api_key)

    def summarize(
        self,
        *,
        plan_text: str | None,
        work_text: str | None,
        project: str | None,
        task: str | None,
        hours: float | None,
    ) -> SummaryResult:
        prompt = build_prompt(plan_text, work_text, project, task, hours)
        try:
            response = self._client.messages.parse(
                model=self.model_id,
                max_tokens=1024,
                messages=[{"role": "user", "content": prompt}],
                output_format=SummaryResult,
            )
        except anthropic.APIError as exc:
            logger.warning("Anthropic summarize call failed: %s", exc)
            raise SummaryUnavailable(str(exc)) from exc

        return response.parsed_output
