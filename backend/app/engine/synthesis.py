"""Synthesis — the single LLM call in a fund run.

Writes the fund memo (and, later, research theses) from the deterministic
pipeline output. Two hard requirements from the brief:

  * **Exactly one** LLM call per run (the rest of the pipeline is deterministic).
  * **Graceful no-key mode:** with no LLM key configured, ``write_memo`` returns
    ``None`` and the run still completes — the memo is optional, never load-bearing.

Default provider is Groq ``llama-3.3-70b-versatile`` via the installed ``groq``
SDK (no LangChain needed). Other providers fall back to the ``llm.py`` factory,
which imports LangChain lazily.
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any, Optional

from app.config import settings

logger = logging.getLogger(__name__)

_SYSTEM = (
    "You are the portfolio manager of an AI-run paper hedge fund (the Stratton "
    "Fund). Write a concise, honest daily memo (120-200 words) explaining today's "
    "decisions. Reference specific tickers, the agent consensus, and the risk "
    "manager's view. No hype, no disclaimers, no markdown headers — just the memo."
)


def _build_prompt(
    signals: dict[str, list[dict]],
    risk: list[dict],
    orders: list[dict],
) -> str:
    lines: list[str] = []
    for r in risk:
        t = r["ticker"]
        lines.append(
            f"{t}: consensus={r['signal']} conf={r['confidence']} "
            f"(bull {r.get('bull_count', 0)}/bear {r.get('bear_count', 0)})"
        )
    order_lines = [
        f"{o['ticker']}: {o['action']} {o['quantity']} — {o['reasoning']}"
        for o in orders
    ]
    return (
        f"{_SYSTEM}\n\n"
        f"Risk-adjusted consensus:\n" + "\n".join(lines) + "\n\n"
        f"Final orders:\n" + "\n".join(order_lines) + "\n\n"
        f"Write the memo now."
    )


def _complete_sync(prompt: str) -> str:
    provider = settings.llm_provider.lower()

    # Preferred: direct Groq SDK (installed; no LangChain dependency).
    if provider == "groq" and settings.groq_api_key:
        from groq import Groq

        from app.engine import llm_usage

        client = Groq(api_key=settings.groq_api_key)
        resp = client.chat.completions.create(
            model=settings.llm_model,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=600,
        )
        usage = getattr(resp, "usage", None)
        if usage is not None:
            llm_usage.record(
                settings.llm_model,
                getattr(usage, "prompt_tokens", 0) or 0,
                getattr(usage, "completion_tokens", 0) or 0,
            )
        return (resp.choices[0].message.content or "").strip()

    # Fallback: LangChain factory (imported lazily inside get_chat_model).
    from app.engine.llm import get_chat_model

    llm = get_chat_model(temperature=0.3)
    return str(llm.invoke(prompt).content).strip()


async def write_memo(
    signals: dict[str, list[dict]],
    risk: list[dict],
    orders: list[dict],
    **_: Any,
) -> Optional[str]:
    """Return the AI fund memo, or ``None`` when no LLM key is configured / on error."""
    if not settings.has_any_llm_key():
        logger.info("No LLM key configured — skipping memo (deterministic run stands).")
        return None
    prompt = _build_prompt(signals, risk, orders)
    try:
        return await asyncio.to_thread(_complete_sync, prompt)
    except Exception as e:  # noqa: BLE001 — memo is best-effort, never fatal
        logger.warning("Memo synthesis failed (%s); continuing without memo.", e)
        return None
