from __future__ import annotations

import json
import logging

import openai

from backend.llm.base import SummaryResult, SummaryUnavailable, build_prompt

logger = logging.getLogger("timetrack.llm.openai")

_SCHEMA = {
    "type": "object",
    "properties": {
        "summary": {"type": "string"},
        "suggested_project": {"type": ["string", "null"]},
        "suggested_task": {"type": ["string", "null"]},
    },
    "required": ["summary", "suggested_project", "suggested_task"],
    "additionalProperties": False,
}


class OpenAIProvider:
    def __init__(self, api_key: str, model_id: str) -> None:
        self.model_id = model_id
        self._client = openai.OpenAI(api_key=api_key)

    def summarize(
        self,
        *,
        plan_text: str | None,
        work_text: str | None,
        project: str | None,
        task: str | None,
        hours: float | None,
        activities: list[str] = (),
    ) -> SummaryResult:
        prompt = build_prompt(plan_text, work_text, project, task, hours, activities)
        try:
            response = self._client.responses.create(
                model=self.model_id,
                input=[{"role": "user", "content": prompt}],
                text={
                    "format": {
                        "type": "json_schema",
                        "name": "day_summary",
                        "strict": True,
                        "schema": _SCHEMA,
                    }
                },
            )
        except openai.OpenAIError as exc:
            logger.warning("OpenAI summarize call failed: %s", exc)
            raise SummaryUnavailable(str(exc)) from exc

        try:
            data = json.loads(response.output_text)
        except (json.JSONDecodeError, AttributeError) as exc:
            logger.warning("OpenAI returned unparseable output: %s", exc)
            raise SummaryUnavailable("Model returned an unexpected response shape.") from exc

        return SummaryResult(**data)
