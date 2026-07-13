"""Ledger + NAV math: buy/sell/cash and FX-converted NAV. Offline, in-memory."""
from __future__ import annotations

import asyncio

from app.fund import ledger, nav
from tests._fakes import make_memory_db


def _run(coro):
    return asyncio.run(coro)


def test_buy_reduces_cash_and_creates_position():
    async def go():
        engine, sm = await make_memory_db()
        async with sm() as s:
            fund = await ledger.get_or_create_fund(s, "t", defaults={"starting_cash": 100_000, "universe": []})
            executed = await ledger.apply_orders(
                s, fund, [{"ticker": "TCS.NS", "action": "buy", "quantity": 10, "reasoning": "x"}],
                {"TCS.NS": 2000.0}, fx_usdinr=83.0,
            )
            await s.commit()
            assert executed[0]["executed_qty"] == 10
            assert abs(fund.cash - (100_000 - 10 * 2000)) < 1e-6  # INR: fx multiplier 1
            pos = await ledger.get_positions(s, "t")
            assert pos[0].shares == 10 and pos[0].avg_cost == 2000.0 and pos[0].currency == "INR"
        await engine.dispose()

    _run(go())


def test_buy_capped_by_available_cash():
    async def go():
        engine, sm = await make_memory_db()
        async with sm() as s:
            fund = await ledger.get_or_create_fund(s, "t", defaults={"starting_cash": 5000})
            executed = await ledger.apply_orders(
                s, fund, [{"ticker": "TCS.NS", "action": "buy", "quantity": 10}],
                {"TCS.NS": 2000.0},
            )
            assert executed[0]["executed_qty"] == 2  # floor(5000/2000)
            assert abs(fund.cash - 1000) < 1e-6
        await engine.dispose()

    _run(go())


def test_sell_reduces_shares_and_adds_cash():
    async def go():
        engine, sm = await make_memory_db()
        async with sm() as s:
            fund = await ledger.get_or_create_fund(s, "t", defaults={"starting_cash": 100_000})
            await ledger.apply_orders(s, fund, [{"ticker": "TCS.NS", "action": "buy", "quantity": 10}], {"TCS.NS": 2000.0})
            await ledger.apply_orders(s, fund, [{"ticker": "TCS.NS", "action": "sell", "quantity": 4}], {"TCS.NS": 2500.0})
            await s.commit()
            pos = await ledger.get_positions(s, "t")
            assert pos[0].shares == 6
            # 100000 - 20000 (buy) + 10000 (sell 4 @ 2500) = 90000
            assert abs(fund.cash - 90_000) < 1e-6
        await engine.dispose()

    _run(go())


def test_usd_buy_and_nav_use_fx():
    async def go():
        engine, sm = await make_memory_db()
        async with sm() as s:
            fund = await ledger.get_or_create_fund(s, "t", defaults={"starting_cash": 100_000, "base_currency": "INR"})
            await ledger.apply_orders(
                s, fund, [{"ticker": "AAPL", "action": "buy", "quantity": 2}],
                {"AAPL": 100.0}, fx_usdinr=83.0,
            )
            # cost_base = 2 * 100 * 83 = 16600
            assert abs(fund.cash - (100_000 - 16_600)) < 1e-6
            pos = await ledger.get_positions(s, "t")
            assert pos[0].currency == "USD" and pos[0].avg_cost == 100.0

            nav_value, cash, pv = await nav.compute_nav(s, fund, {"AAPL": 110.0}, 83.0)
            # positions_value = 2 * 110 * 83 = 18260; nav = 83400 + 18260
            assert abs(pv - 18_260) < 1e-6
            assert abs(nav_value - (83_400 + 18_260)) < 1e-6
        await engine.dispose()

    _run(go())
