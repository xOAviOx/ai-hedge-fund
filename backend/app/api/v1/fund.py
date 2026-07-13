"""Fund router — state, positions, orders, NAV, run-now, kill-switch, config."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_cache, get_current_user, get_db
from app.data.cache import MarketCache
from app.data.models import Fund, NavSnapshot, OrderRow
from app.data.symbols import resolve_symbol
from app.fund import ledger, nav
from app.fund.service import run_fund

router = APIRouter(prefix="/fund", tags=["fund"])


def _fund_dict(f: Fund) -> dict:
    return {
        "fund_id": f.id,
        "base_currency": f.base_currency,
        "starting_cash": f.starting_cash,
        "cash": round(f.cash, 2),
        "universe": f.universe,
        "position_cap_pct": f.position_cap_pct,
        "active_personas": f.active_personas,
        "schedule_cron": f.schedule_cron,
        "is_paused": f.is_paused,
    }


@router.get("")
async def get_fund(user: str = Depends(get_current_user), session: AsyncSession = Depends(get_db)) -> dict:
    fund = await ledger.get_or_create_fund(session, user)
    await session.commit()
    latest = (await session.execute(
        select(NavSnapshot).where(NavSnapshot.fund_id == user).order_by(desc(NavSnapshot.ts)).limit(1)
    )).scalar_one_or_none()
    return {**_fund_dict(fund), "latest_nav": latest.nav if latest else round(fund.cash, 2)}


@router.get("/positions")
async def positions(user: str = Depends(get_current_user), session: AsyncSession = Depends(get_db)) -> list[dict]:
    rows = await ledger.get_positions(session, user)
    return [
        {
            "ticker": p.ticker, "shares": p.shares, "avg_cost": round(p.avg_cost, 2),
            "currency": p.currency, "cost_basis": round(p.shares * p.avg_cost, 2),
        }
        for p in rows if p.shares > 0
    ]


@router.get("/orders")
async def orders(
    user: str = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
    limit: int = Query(50, ge=1, le=500),
) -> list[dict]:
    rows = (await session.execute(
        select(OrderRow).where(OrderRow.fund_id == user).order_by(desc(OrderRow.ts)).limit(limit)
    )).scalars().all()
    return [
        {
            "id": o.id, "run_id": o.run_id, "ticker": o.ticker, "action": o.action,
            "quantity": o.quantity, "price": o.price, "reasoning": o.reasoning,
            "ts": o.ts.isoformat(),
        }
        for o in rows
    ]


@router.get("/nav")
async def nav_history(
    user: str = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
    limit: int = Query(365, ge=1, le=3650),
) -> list[dict]:
    rows = await nav.nav_history(session, user, limit)
    return [
        {"ts": s.ts.isoformat(), "nav": s.nav, "cash": s.cash, "positions_value": s.positions_value}
        for s in rows
    ]


@router.post("/run")
async def run_now(
    user: str = Depends(get_current_user), cache: MarketCache = Depends(get_cache)
) -> dict:
    return await run_fund(user, cache=cache)


@router.post("/pause")
async def pause(user: str = Depends(get_current_user), session: AsyncSession = Depends(get_db)) -> dict:
    fund = await ledger.get_or_create_fund(session, user)
    fund.is_paused = True
    await session.commit()
    return {"fund_id": user, "is_paused": True}


@router.post("/resume")
async def resume(user: str = Depends(get_current_user), session: AsyncSession = Depends(get_db)) -> dict:
    fund = await ledger.get_or_create_fund(session, user)
    fund.is_paused = False
    await session.commit()
    return {"fund_id": user, "is_paused": False}


class FundConfig(BaseModel):
    universe: Optional[list[str]] = None
    active_personas: Optional[list[str]] = None
    position_cap_pct: Optional[float] = None
    schedule_cron: Optional[str] = None
    base_currency: Optional[str] = None


@router.put("/config")
async def update_config(
    cfg: FundConfig,
    user: str = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> dict:
    fund = await ledger.get_or_create_fund(session, user)
    if cfg.universe is not None:
        fund.universe = [resolve_symbol(s) for s in cfg.universe]
    if cfg.active_personas is not None:
        fund.active_personas = cfg.active_personas
    if cfg.position_cap_pct is not None:
        fund.position_cap_pct = cfg.position_cap_pct
    if cfg.schedule_cron is not None:
        fund.schedule_cron = cfg.schedule_cron
    if cfg.base_currency is not None:
        fund.base_currency = cfg.base_currency
    await session.commit()
    return _fund_dict(fund)
