"""Research router — on-demand single-ticker analysis.

Runs the full pipeline for one ticker and returns every agent's signal, the risk
verdict, the PM's order, and (optionally) an AI thesis. This does NOT touch the
fund ledger or decision store — it's read-only analysis. SSE streaming is added
in Phase 5 (frontend); this JSON endpoint is the real data source behind it.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from app.api.deps import get_cache
from app.data.cache import MarketCache
from app.engine.pipeline import run_pipeline

router = APIRouter(prefix="/research", tags=["research"])


@router.get("/{ticker}")
async def research(
    ticker: str,
    include_memo: bool = Query(False, description="Run the (optional) LLM thesis call"),
    cache: MarketCache = Depends(get_cache),
) -> dict:
    result = await run_pipeline(
        [ticker], personas="all", cache=cache, write_memo=include_memo, resolve=True
    )
    t = result.tickers[0]
    signals = {agent_id: sigs[0] for agent_id, sigs in result.signals.items() if sigs}
    return {
        "ticker": t,
        "price": result.current_prices.get(t),
        "risk": next((r for r in result.risk if r["ticker"] == t), None),
        "order": next((o for o in result.orders if o["ticker"] == t), None),
        "signals": signals,
        "memo": result.memo,
        "timings": result.timings,
    }
