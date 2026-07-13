"""Asyncio pipeline — replaces the LangGraph fan-out/fan-in workflow.

The old topology (START -> analysts+personas in parallel -> risk_manager ->
portfolio_manager -> END) was a *static* graph, so LangGraph bought nothing that
``asyncio.gather`` doesn't do natively — with far less weight and cold-start cost
(see ``docs/adr/001-remove-langgraph.md``). Flow:

    prefetch (through cache) -> gather(analysts, persona_engine) -> merge signals
    -> risk_manager -> portfolio_manager -> synthesis.write_memo (one LLM call)

Everything up to the memo is deterministic; the memo is optional (no key -> None).
"""
from __future__ import annotations

import argparse
import asyncio
import logging
import time
from dataclasses import dataclass
from typing import Any, Optional

from app.data.symbols import resolve_symbol
from app.engine import synthesis
from app.engine.analysts.fundamentals import fundamentals_agent
from app.engine.analysts.growth import growth_agent
from app.engine.analysts.macro_regime import macro_regime_agent
from app.engine.analysts.sentiment import sentiment_agent
from app.engine.analysts.technical import technical_agent
from app.engine.analysts.valuation import valuation_agent
from app.engine.personas import get_persona_engine
from app.engine.portfolio_manager import portfolio_manager_agent
from app.engine.prefetch import prefetch
from app.engine.risk_manager import risk_manager_agent

logger = logging.getLogger(__name__)

# Core analysts (always run). Personas are handled by the PersonaEngine.
ANALYSTS = {
    "fundamentals": fundamentals_agent,
    "technical": technical_agent,
    "sentiment": sentiment_agent,
    "valuation": valuation_agent,
    "growth": growth_agent,
    "macro_regime": macro_regime_agent,
}

_DEFAULT_PORTFOLIO = {"cash": 100000, "positions": {}, "total_value": 100000}


@dataclass
class RunResult:
    tickers: list[str]
    signals: dict[str, list[dict]]      # agent_id -> [signal, ...]
    risk: list[dict]                    # risk-adjusted consensus per ticker
    orders: list[dict]                  # portfolio manager positions
    memo: Optional[str]                 # AI memo (None without an LLM key)
    current_prices: dict[str, float]
    timings: dict[str, float]
    portfolio: dict[str, Any]


async def run_pipeline(
    tickers: list[str],
    *,
    personas: Any = "all",
    portfolio: Optional[dict] = None,
    cache: Any = None,
    write_memo: bool = True,
    resolve: bool = True,
    start: Optional[str] = None,
    end: Optional[str] = None,
) -> RunResult:
    """Run one full analysis over ``tickers`` and return a :class:`RunResult`."""
    t0 = time.perf_counter()

    resolved = [resolve_symbol(t) for t in tickers] if resolve else list(tickers)
    data = await prefetch(resolved, start=start, end=end, cache=cache)
    data["tickers"] = resolved
    data["portfolio"] = portfolio or dict(_DEFAULT_PORTFOLIO)
    t_prefetch = time.perf_counter() - t0

    state = {"data": data, "metadata": {}}
    persona_engine = get_persona_engine()
    persona_list = None if personas in (None, "all", ["all"]) else personas

    async def _analyst(fn):
        return await asyncio.to_thread(fn, state)

    async def _personas():
        return await asyncio.to_thread(persona_engine.evaluate_all, data, persona_list)

    t1 = time.perf_counter()
    results = await asyncio.gather(*[_analyst(fn) for fn in ANALYSTS.values()], _personas())
    t_agents = time.perf_counter() - t1

    persona_signals = results[-1]
    signals: dict[str, list[dict]] = {}
    for res in results[:-1]:
        signals.update(res["data"]["analyst_signals"])
    signals.update(persona_signals)
    data["analyst_signals"] = signals

    risk_out = risk_manager_agent(state)["data"]
    data["risk_adjusted_signals"] = risk_out["risk_adjusted_signals"]
    data["current_prices"] = risk_out["current_prices"]

    pm_out = portfolio_manager_agent(state)["data"]["portfolio_output"]

    memo = None
    if write_memo:
        memo = await synthesis.write_memo(
            signals, data["risk_adjusted_signals"], pm_out["positions"]
        )

    return RunResult(
        tickers=resolved,
        signals=signals,
        risk=data["risk_adjusted_signals"],
        orders=pm_out["positions"],
        memo=memo,
        current_prices=data["current_prices"],
        timings={
            "prefetch_s": round(t_prefetch, 3),
            "agents_s": round(t_agents, 3),
            "total_s": round(time.perf_counter() - t0, 3),
        },
        portfolio=pm_out,
    )


# ── CLI (acceptance: `python -m app.engine.pipeline --tickers RELIANCE.NS,TCS.NS`) ──


def _main() -> None:
    ap = argparse.ArgumentParser(description="Run the Stratton Fund analysis pipeline.")
    ap.add_argument("--tickers", default="RELIANCE.NS,TCS.NS", help="comma-separated symbols")
    ap.add_argument("--personas", default="all", help="'all' or comma-separated persona keys")
    ap.add_argument("--no-memo", action="store_true", help="skip the LLM memo call")
    ap.add_argument("-v", "--verbose", action="store_true")
    args = ap.parse_args()

    logging.basicConfig(
        level=logging.INFO if args.verbose else logging.WARNING,
        format="%(levelname)s %(name)s: %(message)s",
    )
    tickers = [t.strip() for t in args.tickers.split(",") if t.strip()]
    personas = None if args.personas in ("all", "") else [p.strip() for p in args.personas.split(",")]

    result = asyncio.run(
        run_pipeline(tickers, personas=personas or "all", write_memo=not args.no_memo)
    )

    from app.data.cache import get_stats

    print("=" * 66)
    print(f"STRATTON FUND - pipeline run: {', '.join(result.tickers)}")
    print("=" * 66)
    print(f"agents fired: {len(result.signals)}  |  timings: {result.timings}")
    print(f"cache: {get_stats()}")
    print("-" * 66)
    for r in result.risk:
        px = result.current_prices.get(r["ticker"], 0)
        print(
            f"  {r['ticker']:<12} {r['signal']:<8} conf={r['confidence']:<3} "
            f"bull/bear={r['bull_count']}/{r['bear_count']}  px={px:.2f}"
        )
    print("-" * 66)
    print("ORDERS:")
    for o in result.orders:
        print(f"  {o['ticker']:<12} {o['action']:<5} qty={o['quantity']:<6} | {o['reasoning']}")
    print("-" * 66)
    print("MEMO:", result.memo if result.memo else "(none — no LLM key configured)")


if __name__ == "__main__":
    _main()
