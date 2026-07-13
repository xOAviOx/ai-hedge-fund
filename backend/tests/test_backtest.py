"""Point-in-time backtest: engine correctness + persisted store lifecycle."""
from __future__ import annotations

import asyncio
from datetime import date

from app.backtest.engine import BacktestParams, _period_available, run_backtest
from app.backtest.store import get_backtest, run_and_wait
from app.backtest.tracker import PortfolioTracker
from tests._fakes import FakeCache, make_memory_db


class _P:
    """Minimal stand-in for a FinancialsPeriod for the availability check."""

    def __init__(self, period=None, filing_date=None):
        self.period = period
        self.filing_date = filing_date


def test_point_in_time_availability():
    # Annual "2024" figures are public ~Q1 2025 — not before.
    assert _period_available(_P(period="2024"), date(2025, 1, 10)) is False
    assert _period_available(_P(period="2023"), date(2025, 1, 10)) is True
    # Explicit filing date is authoritative.
    assert _period_available(_P(period="2024-03-31", filing_date="2024-05-02"), date(2024, 6, 1)) is True
    assert _period_available(_P(period="2024-03-31", filing_date="2024-05-02"), date(2024, 4, 1)) is False


def test_run_backtest_produces_metrics_and_curve():
    async def go():
        params = BacktestParams(
            universe=["AAA", "BBB"],
            start="2025-01-10",
            end="2025-02-25",
            initial_cash=1_000_000,
            step_days=7,
            personas="all",
            benchmark="^NSEI",
        )
        seen: list[float] = []
        result = await run_backtest(params, cache=FakeCache(), progress_cb=lambda p: seen.append(p) or asyncio.sleep(0))

        assert result["tickers"] == ["AAA.NS", "BBB.NS"]
        assert len(result["equity_curve"]) >= 3
        assert all("value" in pt and "date" in pt for pt in result["equity_curve"])
        assert result["metrics"]["total_return_pct"] is not None
        assert isinstance(result["trades"], list)  # trade path exercised (data-dependent)
        assert result["disclosure"].startswith("Backtests are point-in-time")
        assert seen and seen[-1] == 1.0  # progress completes

    asyncio.run(go())


def test_tracker_buy_sell_cash_and_pnl():
    from datetime import date as _date

    t = PortfolioTracker(initial_cash=100_000, commission_rate=0.0, slippage_rate=0.0)
    t.apply_trades({"positions": [{"ticker": "X", "action": "buy", "quantity": 100}]}, {"X": 50.0}, _date(2025, 1, 6))
    assert t.positions["X"]["shares"] == 100
    assert t.cash == 95_000  # 100 * 50, no fees
    t.take_snapshot(_date(2025, 1, 6), {"X": 55.0})
    assert t.snapshots[-1].total_value == 100_500  # 95_000 cash + 100 * 55

    t.apply_trades({"positions": [{"ticker": "X", "action": "sell", "quantity": 100}]}, {"X": 60.0}, _date(2025, 1, 13))
    assert "X" not in t.positions
    assert t.cash == 101_000  # 95_000 + 100 * 60
    assert len(t.trades) == 2 and t.trades[-1].action == "sell"


def test_store_persists_result():
    async def go():
        engine, sm = await make_memory_db()
        params = BacktestParams(
            universe=["AAA"], start="2025-01-10", end="2025-02-10", initial_cash=500_000, personas="all",
        )
        bt_id = await run_and_wait(params, "local", cache=FakeCache(), session_maker=sm)

        async with sm() as s:
            row = await get_backtest(s, bt_id)
            assert row is not None
            assert row.status == "done"
            assert row.progress == 1.0
            assert row.result and row.result["metrics"]["total_trades"] >= 0
            assert row.fund_id == "local"
        await engine.dispose()

    asyncio.run(go())
