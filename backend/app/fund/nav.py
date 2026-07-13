"""NAV computation with FX conversion.

Positions are held in their native currency (avg_cost / price are native); the
fund's NAV is expressed in its base currency (default INR). USD holdings convert
at the cached USDINR rate. Cash is always kept in base currency.
"""
from __future__ import annotations

from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.data.models import Fund, NavSnapshot, PositionRow


def currency_of(symbol: str) -> str:
    """INR for NSE/BSE symbols and Indian indices; USD otherwise."""
    s = symbol.upper()
    if s.endswith(".NS") or s.endswith(".BO") or s.startswith("^NSE") or s.startswith("^BSE"):
        return "INR"
    return "USD"


def fx_to_base(currency: str, base: str, fx_usdinr: float) -> float:
    """Multiplier converting an amount in ``currency`` into ``base``."""
    if currency == base:
        return 1.0
    if currency == "USD" and base == "INR":
        return fx_usdinr
    if currency == "INR" and base == "USD" and fx_usdinr:
        return 1.0 / fx_usdinr
    return 1.0  # unknown pair — treat 1:1 rather than fabricate a rate


async def compute_nav(
    session: AsyncSession,
    fund: Fund,
    prices: dict[str, float],
    fx_usdinr: float,
) -> tuple[float, float, float]:
    """Return ``(nav, cash, positions_value)`` in the fund's base currency."""
    rows = (await session.execute(
        select(PositionRow).where(PositionRow.fund_id == fund.id)
    )).scalars().all()

    positions_value = 0.0
    for p in rows:
        if p.shares <= 0:
            continue
        price = prices.get(p.ticker, p.avg_cost)  # fall back to cost if no live px
        native_value = p.shares * price
        positions_value += native_value * fx_to_base(p.currency, fund.base_currency, fx_usdinr)

    nav = fund.cash + positions_value
    return round(nav, 2), round(fund.cash, 2), round(positions_value, 2)


async def snapshot_nav(
    session: AsyncSession,
    fund: Fund,
    prices: dict[str, float],
    fx_usdinr: float,
) -> NavSnapshot:
    nav, cash, positions_value = await compute_nav(session, fund, prices, fx_usdinr)
    snap = NavSnapshot(fund_id=fund.id, nav=nav, cash=cash, positions_value=positions_value)
    session.add(snap)
    return snap


async def nav_history(
    session: AsyncSession, fund_id: str, limit: Optional[int] = 365
) -> list[NavSnapshot]:
    stmt = select(NavSnapshot).where(NavSnapshot.fund_id == fund_id).order_by(NavSnapshot.ts.asc())
    if limit:
        stmt = stmt.limit(limit)
    return list((await session.execute(stmt)).scalars().all())
