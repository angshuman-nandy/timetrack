"""Provider-agnostic summarization contract. Both providers implement this Protocol so
the router never branches on which one is configured."""

from __future__ import annotations

from typing import Protocol

from pydantic import BaseModel


class SummaryResult(BaseModel):
    summary: str
    suggested_project: str | None = None
    suggested_task: str | None = None


class SummaryUnavailable(Exception):
    """Raised when no provider is configured, or the call fails. Routers turn this into
    a 503 — the app must stay usable without an LLM key."""


class SummaryProvider(Protocol):
    model_id: str

    def summarize(
        self,
        *,
        plan_text: str | None,
        work_text: str | None,
        project: str | None,
        task: str | None,
        hours: float | None,
    ) -> SummaryResult: ...


def build_prompt(
    plan_text: str | None, work_text: str | None, project: str | None, task: str | None, hours: float | None
) -> str:
    lines = ["Write a brief, client-ready description of a day's billable work."]
    if project:
        lines.append(f"Project: {project}")
    if task:
        lines.append(f"Task: {task}")
    if hours is not None:
        lines.append(f"Hours logged: {hours}")
    lines.append(f"Morning plan / to-do list: {plan_text or '(none given)'}")
    lines.append(f"End-of-day notes on what was actually done: {work_text or '(none given)'}")
    lines.append(
        "\nWrite 1-3 sentences, past tense, professional but plain — the kind of line "
        "that goes directly onto an hourly invoice. No headers, no bullet points, no "
        "restating the hours or project name (those are separate columns). If the notes "
        "mention a specific project or task name that isn't already given above, suggest "
        "them; otherwise leave those fields null."
    )
    return "\n".join(lines)
