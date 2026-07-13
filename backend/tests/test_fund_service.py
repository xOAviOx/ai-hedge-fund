"""run_fund integration: a full run persists the decision store & applies orders."""
from __future__ import annotations

import asyncio

from sqlalchemy import func, select

from app.data.models import OrderRow, Run, SignalRow
from app.fund import ledger
from app.fund.service import run_fund
from tests._fakes import FakeCache, make_memory_db


def test_run_fund_persists_run_signals_orders_and_nav():
    async def go():
        engine, sm = await make_memory_db()
        async with sm() as s:
            await ledger.get_or_create_fund(
                s, "local",
                defaults={"universe": ["MOAT", "VALUE"], "active_personas": ["all"], "starting_cash": 1_000_000},
            )
            await s.commit()

        summary = await run_fund("local", cache=FakeCache(), session_maker=sm, notify=False)
        assert summary["status"] == "ok" and summary["run_id"]
        assert len(summary["universe"]) == 2  # MOAT.NS, VALUE.NS

        async with sm() as s:
            assert len((await s.execute(select(Run))).scalars().all()) == 1
            n_sig = (await s.execute(select(func.count()).select_from(SignalRow))).scalar_one()
            assert n_sig == 18 * 2  # 6 analysts + 12 personas, over 2 tickers
            n_ord = (await s.execute(
                select(func.count()).select_from(OrderRow).where(OrderRow.run_id == summary["run_id"])
            )).scalar_one()
            assert n_ord == 2
            # a NAV snapshot was written
            from app.fund import nav
            assert len(await nav.nav_history(s, "local")) == 1
        await engine.dispose()

    asyncio.run(go())


def test_paused_fund_skips_run():
    async def go():
        engine, sm = await make_memory_db()
        async with sm() as s:
            fund = await ledger.get_or_create_fund(s, "local", defaults={"universe": ["MOAT"]})
            fund.is_paused = True
            await s.commit()

        summary = await run_fund("local", cache=FakeCache(), session_maker=sm, notify=False)
        assert summary["status"] == "paused" and summary["run_id"] is None

        async with sm() as s:
            assert (await s.execute(select(func.count()).select_from(Run))).scalar_one() == 0
        await engine.dispose()

    asyncio.run(go())
