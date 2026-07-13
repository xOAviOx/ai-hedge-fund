"""Process-wide LLM usage + cost accounting (observability).

The pipeline makes at most one LLM call per run (the memo). This module records
token usage from that call and estimates cost from a small per-model price table,
so ``/api/v1/meta/stats`` can report real cumulative LLM spend instead of a
hard-coded zero. Cost is a best-effort estimate — prices change; treat it as a
guide, not a bill.
"""
from __future__ import annotations

import threading
from dataclasses import asdict, dataclass

# USD per 1M tokens (input, output). Approximate list prices; extend as needed.
# Matched by substring against the configured model name.
_PRICING: dict[str, tuple[float, float]] = {
    "llama-3.3-70b": (0.59, 0.79),
    "llama-3.1-8b": (0.05, 0.08),
    "gpt-4o-mini": (0.15, 0.60),
    "gpt-4o": (2.50, 10.00),
    "claude-3-5-haiku": (0.80, 4.00),
    "claude": (3.00, 15.00),
    "deepseek": (0.27, 1.10),
    "gemini-1.5-flash": (0.075, 0.30),
}
_DEFAULT_PRICE = (0.50, 1.50)


def price_for(model: str) -> tuple[float, float]:
    m = (model or "").lower()
    for key, price in _PRICING.items():
        if key in m:
            return price
    return _DEFAULT_PRICE


def estimate_cost(model: str, prompt_tokens: int, completion_tokens: int) -> float:
    pin, pout = price_for(model)
    return (prompt_tokens / 1_000_000) * pin + (completion_tokens / 1_000_000) * pout


@dataclass
class LLMUsage:
    calls: int = 0
    prompt_tokens: int = 0
    completion_tokens: int = 0
    cost_usd: float = 0.0

    def as_dict(self) -> dict:
        d = asdict(self)
        d["cost_usd"] = round(self.cost_usd, 6)
        return d


_lock = threading.Lock()
_usage = LLMUsage()


def record(model: str, prompt_tokens: int, completion_tokens: int) -> float:
    """Record one LLM call; return its estimated cost (USD)."""
    cost = estimate_cost(model, prompt_tokens, completion_tokens)
    with _lock:
        _usage.calls += 1
        _usage.prompt_tokens += int(prompt_tokens or 0)
        _usage.completion_tokens += int(completion_tokens or 0)
        _usage.cost_usd += cost
    return cost


def snapshot() -> LLMUsage:
    with _lock:
        return LLMUsage(_usage.calls, _usage.prompt_tokens, _usage.completion_tokens, _usage.cost_usd)


def reset() -> None:
    with _lock:
        _usage.calls = _usage.prompt_tokens = _usage.completion_tokens = 0
        _usage.cost_usd = 0.0
