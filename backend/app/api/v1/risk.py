"""Risk router — real portfolio risk from cached OHLCV (Phase 6 depth).

Returns NAV-based vol/drawdown plus market-based analytics computed from the
holdings' cached daily prices: annualized volatility, 1-day historical VaR (95%),
Sharpe, beta vs benchmark, a correlation matrix, and a monthly-returns heatmap.
Every figure is computed from real prices — no placeholders.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_cache, get_current_user, get_db
from app.data.cache import MarketCache
from app.risk.service import DEFAULT_BENCHMARK, portfolio_risk

router = APIRouter(prefix="/risk", tags=["risk"])


@router.get("")
async def risk(
    user: str = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
    cache: MarketCache = Depends(get_cache),
    benchmark: str = Query(DEFAULT_BENCHMARK),
) -> dict:
    return await portfolio_risk(session, cache, user, benchmark=benchmark)
