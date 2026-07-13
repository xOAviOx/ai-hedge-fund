"""Paper-trading ledger — SQLite-backed positions/orders/cash.

Evolved from the old ``stratton/src/paper_trader.py`` (JSON/CLI) into a
database-backed ledger. Orders fill at the latest cached price (passed in by the
service); buys are FX-converted to base currency and capped at available cash so
the ledger can never overspend. Positions store native ``avg_cost``; NAV
conversion lives in ``nav.py``.
"""
from __future__ import annotations

import math
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.data.models import Fund, OrderRow, PositionRow
from app.fund.nav import currency_of, fx_to_base

DEFAULT_UNIVERSE = [
    "RELIANCE.NS", "TCS.NS", "HDFCBANK.NS", "INFY.NS", "ICICIBANK.NS",
    "SBIN.NS", "BHARTIARTL.NS", "ITC.NS",
    "AAPL", "MSFT", "GOOGL",
]
DEFAULT_STARTING_CASH = 1_000_000.0  # ₹10,00,000


async def get_or_create_fund(
    session: AsyncSession, fund_id: str, *, defaults: Optional[dict] = None
) -> Fund:
    fund = await session.get(Fund, fund_id)
    if fund is not None:
        return fund
    d = defaults or {}
    cash = float(d.get("starting_cash", DEFAULT_STARTING_CASH))
    fund = Fund(
        id=fund_id,
        base_currency=d.get("base_currency", "INR"),
        starting_cash=cash,
        cash=cash,
        universe=d.get("universe", list(DEFAULT_UNIVERSE)),
        position_cap_pct=float(d.get("position_cap_pct", 30.0)),
        active_personas=d.get("active_personas", ["all"]),
        schedule_cron=d.get("schedule_cron", "45 15 * * mon-fri"),
        is_paused=bool(d.get("is_paused", False)),
    )
    session.add(fund)
    await session.flush()
    return fund


async def get_positions(session: AsyncSession, fund_id: str) -> list[PositionRow]:
    rows = (await session.execute(
        select(PositionRow).where(PositionRow.fund_id == fund_id).order_by(PositionRow.ticker)
    )).scalars().all()
    return list(rows)


async def _get_position(session: AsyncSession, fund_id: str, ticker: str) -> Optional[PositionRow]:
    return (await session.execute(
        select(PositionRow).where(PositionRow.fund_id == fund_id, PositionRow.ticker == ticker)
    )).scalar_one_or_none()


async def apply_orders(
    session: AsyncSession,
    fund: Fund,
    orders: list[dict],
    prices: dict[str, float],
    *,
    fx_usdinr: float = 1.0,
    run_id: Optional[str] = None,
) -> list[dict]:
    """Apply portfolio-manager orders to the ledger. Returns executed order dicts.

    Buys fill only up to affordable cash (FX-converted); sells are capped at held
    shares. Every attempt (including holds / partials) is recorded as an OrderRow.
    """
    executed: list[dict] = []

    for o in orders:
        ticker = o["ticker"]
        action = (o.get("action") or "hold").lower()
        want_qty = int(o.get("quantity", 0) or 0)
        reasoning = o.get("reasoning", "")
        price = float(prices.get(ticker, 0) or 0)
        cur = currency_of(ticker)
        rate = fx_to_base(cur, fund.base_currency, fx_usdinr)

        exec_qty = 0
        if action == "buy" and price > 0 and want_qty > 0:
            unit_base = price * rate
            affordable = int(math.floor(fund.cash / unit_base)) if unit_base > 0 else 0
            exec_qty = min(want_qty, affordable)
            if exec_qty > 0:
                cost_base = exec_qty * unit_base
                fund.cash -= cost_base
                pos = await _get_position(session, fund.id, ticker)
                if pos is None:
                    pos = PositionRow(fund_id=fund.id, ticker=ticker, shares=0.0,
                                      avg_cost=0.0, currency=cur)
                    session.add(pos)
                new_shares = pos.shares + exec_qty
                pos.avg_cost = (pos.shares * pos.avg_cost + exec_qty * price) / new_shares
                pos.shares = new_shares

        elif action == "sell" and price > 0 and want_qty > 0:
            pos = await _get_position(session, fund.id, ticker)
            held = int(pos.shares) if pos else 0
            exec_qty = min(want_qty, held)
            if exec_qty > 0 and pos is not None:
                fund.cash += exec_qty * price * rate
                pos.shares -= exec_qty
                if pos.shares <= 0:
                    pos.shares = 0.0
                    pos.avg_cost = 0.0

        session.add(OrderRow(
            fund_id=fund.id, run_id=run_id, ticker=ticker,
            action=action if exec_qty > 0 else ("hold" if action == "hold" else action),
            quantity=exec_qty, price=price, reasoning=reasoning,
        ))
        executed.append({
            "ticker": ticker, "action": action, "requested_qty": want_qty,
            "executed_qty": exec_qty, "price": price, "reasoning": reasoning,
        })

    return executed
