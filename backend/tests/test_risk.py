"""Risk analytics: pure metric math + a service assembly test on a fake cache."""
from __future__ import annotations

import asyncio
from datetime import date

import pytest

from app.data.models import NavSnapshot, PositionRow
from app.fund import ledger
from app.risk import metrics
from app.risk.service import portfolio_risk
from tests._fakes import FakeCache, make_memory_db


# ── pure metrics ────────────────────────────────────────────────────────

def test_simple_returns_and_var():
    assert metrics.simple_returns([100, 110, 121]) == pytest.approx([0.1, 0.1])
    # 4 returns, 95% -> index 0 -> worst return; VaR is the positive loss
    assert metrics.historical_var([-0.05, -0.02, 0.01, 0.03], 0.95) == 5.0


def test_volatility_beta_correlation():
    assert metrics.annualized_volatility([0.1, 0.1]) == 0.0  # zero dispersion
    series = [0.1, 0.2, 0.3, -0.1]
    assert metrics.beta(series, series) == 1.0
    assert metrics.correlation(series, series) == 1.0
    assert metrics.correlation([0.1, 0.2, 0.3], [-0.1, -0.2, -0.3]) == -1.0


def test_max_drawdown_and_monthly():
    assert metrics.max_drawdown([100, 120, 90, 110]) == -25.0
    mr = metrics.monthly_returns([
        (date(2025, 1, 1), 0.1),
        (date(2025, 1, 2), 0.1),
        (date(2025, 2, 1), -0.05),
    ])
    assert mr == {"2025-01": 21.0, "2025-02": -5.0}


# ── service ─────────────────────────────────────────────────────────────

def test_portfolio_risk_from_positions():
    async def go():
        engine, sm = await make_memory_db()
        async with sm() as s:
            await ledger.get_or_create_fund(s, "local", defaults={"starting_cash": 1_000_000})
            s.add_all([
                PositionRow(fund_id="local", ticker="AAA.NS", shares=10, avg_cost=100, currency="INR"),
                PositionRow(fund_id="local", ticker="BBB.NS", shares=5, avg_cost=200, currency="INR"),
            ])
            s.add_all([
                NavSnapshot(fund_id="local", nav=1_000_000, cash=500_000, positions_value=500_000),
                NavSnapshot(fund_id="local", nav=1_020_000, cash=500_000, positions_value=520_000),
                NavSnapshot(fund_id="local", nav=990_000, cash=500_000, positions_value=490_000),
            ])
            await s.commit()

            report = await portfolio_risk(s, FakeCache(), "local")

        # NAV-based + market-based fields are all present and real.
        assert report["nav_points"] == 3
        assert report["max_drawdown_pct"] is not None
        assert len(report["exposure"]) == 2
        assert report["data_points"] > 0
        assert report["var_95_pct"] is not None
        assert report["annualized_vol_pct"] is not None
        # two holdings -> 2x2 correlation matrix, diagonal 1.0
        corr = report["correlation"]
        assert corr["tickers"] == ["AAA.NS", "BBB.NS"]
        assert corr["matrix"][0][0] == 1.0
        assert report["monthly_returns"]  # non-empty
        await engine.dispose()

    asyncio.run(go())
