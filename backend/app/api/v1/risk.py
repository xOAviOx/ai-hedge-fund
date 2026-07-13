"""Risk router — portfolio risk from real ledger/NAV data.

Phase 4 ships the metrics computable from what the fund already stores: NAV-based
volatility and max drawdown, plus per-position cost exposure. VaR, beta,
correlation heatmap and monthly-returns heatmap are the Phase 6 depth
(Risk Desk) — this endpoint returns real numbers, never placeholders.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.fund import ledger, nav

router = APIRouter(prefix="/risk", tags=["risk"])


@router.get("")
async def risk(
    user: str = Depends(get_current_user), session: AsyncSession = Depends(get_db)
) -> dict:
    snaps = await nav.nav_history(session, user, limit=None)
    navs = [s.nav for s in snaps]

    volatility_pct = None
    max_drawdown_pct = None
    if len(navs) >= 2:
        rets = [navs[i] / navs[i - 1] - 1 for i in range(1, len(navs)) if navs[i - 1] > 0]
        if rets:
            mean = sum(rets) / len(rets)
            var = sum((r - mean) ** 2 for r in rets) / len(rets)
            volatility_pct = round((var ** 0.5) * 100, 3)
        peak, dd = navs[0], 0.0
        for v in navs:
            peak = max(peak, v)
            if peak > 0:
                dd = min(dd, v / peak - 1)
        max_drawdown_pct = round(dd * 100, 3)

    positions = [p for p in await ledger.get_positions(session, user) if p.shares > 0]
    total_cost = sum(p.shares * p.avg_cost for p in positions) or 1.0
    exposure = [
        {
            "ticker": p.ticker,
            "cost_basis": round(p.shares * p.avg_cost, 2),
            "weight_pct": round(p.shares * p.avg_cost / total_cost * 100, 2),
        }
        for p in positions
    ]

    return {
        "nav_points": len(navs),
        "current_nav": navs[-1] if navs else None,
        "volatility_pct": volatility_pct,
        "max_drawdown_pct": max_drawdown_pct,
        "exposure": exposure,
        "note": "VaR, beta, correlation & monthly-returns heatmaps arrive in Phase 6 (Risk Desk).",
    }
