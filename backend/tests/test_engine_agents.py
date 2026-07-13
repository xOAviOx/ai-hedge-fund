"""Engine tests: relocated analysts, risk_manager, portfolio_manager, and the
asyncio pipeline — all offline (a fake cache stands in for yfinance).

These replace the legacy ``stratton/tests/test_*.py`` analyst tests, which
targeted an older LLM-based interface (``_analyze_ticker`` / removed private
helpers) and could not run against the current deterministic engine
(see docs/BASELINE.md §2). Intent is preserved: exercise the real computation
each agent performs, plus the aggregation math, end to end.
"""
from __future__ import annotations

import asyncio
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from app.data.providers.base import (
    Financials,
    FinancialsPeriod,
    News,
    NewsItem,
    OHLCV,
    OHLCVBar,
    TickerDetails,
)
from app.engine.analysts.fundamentals import fundamentals_agent
from app.engine.analysts.growth import growth_agent
from app.engine.analysts.macro_regime import macro_regime_agent
from app.engine.analysts.sentiment import sentiment_agent
from app.engine.analysts.technical import technical_agent
from app.engine.analysts.valuation import valuation_agent
from app.engine.models import CompanyDetails, FinancialMetrics, Price
from app.engine.pipeline import run_pipeline
from app.engine.portfolio_manager import portfolio_manager_agent
from app.engine.risk_manager import risk_manager_agent

_FIX = json.loads(
    (Path(__file__).resolve().parent / "fixtures" / "persona_golden.json").read_text(encoding="utf-8")
)["fixtures"]

ANALYSTS = [
    fundamentals_agent,
    technical_agent,
    sentiment_agent,
    valuation_agent,
    growth_agent,
    macro_regime_agent,
]

_ANCHOR = datetime(2025, 1, 1, tzinfo=timezone.utc)


def _data_from_fixtures() -> dict:
    return {
        "tickers": list(_FIX["tickers"]),
        "financials": {
            t: [FinancialMetrics(**m) for m in ms] for t, ms in _FIX["financials"].items()
        },
        "details": {t: CompanyDetails(**d) for t, d in _FIX["details"].items()},
        "prices": {t: [Price(**b) for b in bs] for t, bs in _FIX["prices"].items()},
        "news": {},
    }


def _linear_prices(start: float, end: float, n: int = 60) -> list[Price]:
    out: list[Price] = []
    for i in range(n):
        c = start + (end - start) * i / (n - 1)
        out.append(
            Price(open=c, high=c, low=c, close=round(c, 4), volume=1_000_000,
                  timestamp=_ANCHOR + timedelta(days=i))
        )
    return out


# ── analysts are well-formed ────────────────────────────────────────


@pytest.mark.parametrize("agent", ANALYSTS)
def test_analyst_signals_wellformed(agent):
    data = _data_from_fixtures()
    out = agent({"data": data})["data"]["analyst_signals"]
    (agent_id, signals), = out.items()
    assert agent_id.endswith("_analyst")
    assert len(signals) == len(data["tickers"])
    for s in signals:
        assert s["signal"] in {"bullish", "bearish", "neutral"}
        assert 0 <= s["confidence"] <= 100
        assert s["ticker"] in data["tickers"]


def test_fundamentals_directions():
    out = fundamentals_agent({"data": _data_from_fixtures()})["data"]["analyst_signals"]["fundamentals_analyst"]
    by = {s["ticker"]: s["signal"] for s in out}
    assert by["MOAT"] == "bullish"       # high ROE, low debt, reasonable P/E
    assert by["DISTRESS"] == "bearish"   # negative ROE, D/E 3.0, weak liquidity


def test_technical_trend_detection():
    up = technical_agent({"data": {"tickers": ["UP"], "prices": {"UP": _linear_prices(100, 150)}}})
    dn = technical_agent({"data": {"tickers": ["DN"], "prices": {"DN": _linear_prices(150, 100)}}})
    assert up["data"]["analyst_signals"]["technical_analyst"][0]["signal"] == "bullish"
    assert dn["data"]["analyst_signals"]["technical_analyst"][0]["signal"] == "bearish"


# ── aggregation math (exact) ────────────────────────────────────────


def test_risk_manager_consensus_math():
    def sig(direction, conf):
        return [{"ticker": "X", "signal": direction, "confidence": conf}]

    data = {
        "tickers": ["X"],
        "prices": {"X": [Price(open=100, high=100, low=100, close=100, volume=1, timestamp=_ANCHOR)]},
        "analyst_signals": {
            "a": sig("bullish", 70), "b": sig("bullish", 70),
            "c": sig("bullish", 70), "d": sig("bearish", 60),
        },
    }
    r = risk_manager_agent({"data": data})["data"]["risk_adjusted_signals"][0]
    assert r["signal"] == "bullish"
    assert r["bull_count"] == 3 and r["bear_count"] == 1
    # avg_conf = 270/4 = 67.5; int(67.5 * 3/4) = 50
    assert r["confidence"] == 50
    assert r["max_position_size"] == 25000


def test_portfolio_manager_actions():
    prices = {"X": 100.0, "Y": 50.0}
    risk = [
        {"ticker": "X", "signal": "bullish", "confidence": 50, "max_position_size": 25000},
        {"ticker": "Y", "signal": "bearish", "confidence": 65, "max_position_size": 5000},
    ]
    data = {
        "risk_adjusted_signals": risk,
        "current_prices": prices,
        "portfolio": {"cash": 100000, "positions": {"Y": {"shares": 10}}, "total_value": 100000},
    }
    pos = {p["ticker"]: p for p in portfolio_manager_agent({"data": data})["data"]["portfolio_output"]["positions"]}
    # bullish: alloc = min(25000, 100000*0.3) = 25000 -> 250 shares @ 100
    assert pos["X"]["action"] == "buy" and pos["X"]["quantity"] == 250
    # bearish with 10 held -> liquidate
    assert pos["Y"]["action"] == "sell" and pos["Y"]["quantity"] == 10


# ── full pipeline, offline ──────────────────────────────────────────


class FakeCache:
    """Implements the subset of MarketCache that prefetch calls."""

    name = "fake"

    async def get_ohlcv(self, sym, interval="1d", start=None, end=None):
        bars = [
            OHLCVBar(ts=_ANCHOR + timedelta(days=i), open=100 + i, high=100 + i,
                     low=100 + i, close=round(100 + i, 4), volume=1_000_000)
            for i in range(60)
        ]
        return OHLCV(symbol=sym, interval=interval, bars=bars)

    async def get_financials(self, sym, quarters=8):
        return Financials(symbol=sym, periods=[
            FinancialsPeriod(period="2024", fiscal_period="FY2024", revenue=55e9, net_income=11e9,
                             earnings_per_share=6.0, return_on_equity=0.22, debt_to_equity=0.3,
                             free_cash_flow=9e9, shareholders_equity=50e9, current_ratio=1.8,
                             net_profit_margin=0.20),
            FinancialsPeriod(period="2023", fiscal_period="FY2023", revenue=48e9, net_income=9e9,
                             earnings_per_share=5.0, return_on_equity=0.20, debt_to_equity=0.32,
                             free_cash_flow=8e9, shareholders_equity=45e9, current_ratio=1.7,
                             net_profit_margin=0.187),
        ])

    async def get_news(self, sym, limit=20):
        return News(symbol=sym, items=[
            NewsItem(title="Company beats estimates on strong growth", summary="record profit and upgrade"),
        ])

    async def get_details(self, sym):
        return TickerDetails(symbol=sym, name=f"{sym} Inc", market_cap=220e9, employees=60000,
                             shares_outstanding=15e9, description="AI cloud and robotics platform")


def test_pipeline_end_to_end_offline():
    result = asyncio.run(
        run_pipeline(["MOAT", "VALUE"], cache=FakeCache(), resolve=False, write_memo=False)
    )
    # 6 analysts + 12 personas all fired
    assert len(result.signals) == 18
    assert all(len(sigs) == 2 for sigs in result.signals.values())
    assert len(result.risk) == 2
    assert len(result.orders) == 2
    assert result.memo is None
    assert result.current_prices["MOAT"] == 159.0  # last close = 100 + 59
