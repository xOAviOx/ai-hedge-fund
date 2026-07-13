"""Engine state container.

The LangGraph ``AgentState`` (with its ``langchain_core.messages`` reducer) is
gone: the asyncio pipeline (``pipeline.py``) merges agent outputs explicitly, so
no graph reducer is needed. What remains is a plain, dependency-free shape that
agents read from — ``state["data"]`` holds tickers / prices / financials / news /
details / analyst_signals, exactly as the ported agents expect.
"""
from __future__ import annotations

from typing import Any, TypedDict


class AgentState(TypedDict, total=False):
    """Shared state passed to every agent. ``total=False`` — keys are optional."""

    data: dict[str, Any]
    metadata: dict[str, Any]


def new_state(data: dict[str, Any] | None = None, metadata: dict[str, Any] | None = None) -> AgentState:
    return {"data": data or {}, "metadata": metadata or {}}


def merge_signals(target: dict[str, Any], result: dict[str, Any]) -> None:
    """Merge one agent's ``{"data": {"analyst_signals": {id: [...]}}}`` into ``target``.

    Replaces the LangGraph ``merge_dicts`` reducer for the one shape the pipeline
    actually fans in: nested ``analyst_signals`` are accumulated, not overwritten.
    """
    payload = (result or {}).get("data", {})
    signals = payload.get("analyst_signals", {})
    bucket = target.setdefault("analyst_signals", {})
    bucket.update(signals)
