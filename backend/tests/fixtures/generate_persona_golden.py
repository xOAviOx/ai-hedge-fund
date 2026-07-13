"""Generate golden parity fixtures for the 12 persona agents (Phase 0 safety net).

WHY THIS EXISTS
---------------
Phase 3 replaces the 12 copy-paste persona agents (``src/agents/*.py``) with a
single config-driven ``PersonaEngine`` + one YAML per investor. The contract for
that refactor is *bit-for-bit parity*: the new engine must reproduce the exact
signal (direction, confidence, reasoning) that today's deterministic agents emit.

This script captures that oracle NOW, while the old agents still exist:
  * It builds a set of hand-crafted ``AgentState`` fixtures using the REAL
    pydantic data models (``FinancialMetrics`` / ``Price`` / ``CompanyDetails``),
    designed so different personas fire in different directions.
  * It runs every persona in ``PERSONA_CONFIG`` against those fixtures.
  * It writes BOTH the serialized inputs and the resulting signals to
    ``persona_golden.json`` so the Phase-3 parity test is fully self-contained
    (reload fixtures -> feed the new engine -> assert equality vs ``golden``).

NOTE: the existing ``stratton/tests/test_*.py`` persona tests could NOT be used as
the oracle — they target an older LLM-based interface (``_analyze_ticker`` /
``call_llm``) that no longer exists in the slimmed source, so they error/fail
against the current deterministic agents (see docs/BASELINE.md). We therefore
generate the oracle directly from the current agent code, which is exactly the
behaviour Phase 3 must preserve.

RUN (from repo root):
    PYTHONPATH=backend/app/stratton python backend/tests/fixtures/generate_persona_golden.py

This depends on pre-Phase-3 source (``src.config.agents``); once the personas are
migrated, ``persona_golden.json`` is the frozen oracle and this generator is kept
only for provenance.
"""
from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

# Ensure `src` (stratton root) is importable regardless of CWD.
STRATTON_ROOT = Path(__file__).resolve().parents[3] / "backend" / "app" / "stratton"
if not (STRATTON_ROOT / "src").is_dir():
    # Fallback: allow running with PYTHONPATH already pointing at stratton.
    STRATTON_ROOT = Path(__file__).resolve().parents[2] / "app" / "stratton"
sys.path.insert(0, str(STRATTON_ROOT))

# The legacy stratton `src.data` package eagerly imports `polygon_client`, which
# imports the polygon SDK at module load. That SDK is NOT part of the target
# architecture (Phase 2+ uses yfinance) and is uninstalled here. The persona
# agents never call it — the import is only a package-init side effect — so we
# stub it to import the models/agents without pulling a throwaway dependency.
if "polygon" not in sys.modules:
    import types as _types

    _polygon_stub = _types.ModuleType("polygon")
    _polygon_stub.RESTClient = object  # type: ignore[attr-defined]
    sys.modules["polygon"] = _polygon_stub

from src.config.agents import PERSONA_CONFIG  # noqa: E402
from src.data.models import CompanyDetails, FinancialMetrics, Price  # noqa: E402

OUT_PATH = Path(__file__).resolve().parent / "persona_golden.json"

# Anchor date for deterministic timestamps (value is irrelevant to persona logic,
# which only reads `.close`; fixed so regeneration is byte-stable).
_ANCHOR = datetime(2025, 1, 1, tzinfo=timezone.utc)


def make_prices(c30: float, c20: float, c1: float, n: int = 40) -> list[Price]:
    """Build an n-bar close path with control points at indices [-30], [-20], [-1].

    Personas only read `.close` at positions -1, -20, -30, so we pin those three
    and linearly interpolate between them (flat before -30). n=40 guarantees the
    ``len(prices) > 30`` guards in several personas are satisfied.
    """
    idx30, idx20, idx1 = n - 30, n - 20, n - 1
    closes: list[float] = [0.0] * n
    for i in range(0, idx30 + 1):
        closes[i] = c30
    for i in range(idx30, idx20 + 1):
        f = (i - idx30) / (idx20 - idx30)
        closes[i] = c30 + (c20 - c30) * f
    for i in range(idx20, idx1 + 1):
        f = (i - idx20) / (idx1 - idx20)
        closes[i] = c20 + (c1 - c20) * f

    bars: list[Price] = []
    for i, close in enumerate(closes):
        ts = _ANCHOR + timedelta(days=i)
        bars.append(
            Price(
                open=round(close * 0.997, 4),
                high=round(close * 1.012, 4),
                low=round(close * 0.988, 4),
                close=round(close, 4),
                volume=1_000_000,
                timestamp=ts,
            )
        )
    return bars


def fm(ticker: str, fiscal: str, **kw) -> FinancialMetrics:
    return FinancialMetrics(ticker=ticker, period="annual", fiscal_period=fiscal, **kw)


def build_fixtures() -> dict:
    """Four distinct company profiles + an SPY market series.

    Profiles are chosen to exercise bull AND bear branches across the 12 personas:
      MOAT     — high-ROE compounder, low debt, upward momentum
      VALUE    — cheap (low P/E, high FCF yield), strong balance sheet, flat price
      DISTRESS — over-levered, unprofitable, revenue declining, sharp drawdown
      MEGA     — mega-cap, strong growth, strong relative strength vs SPY
    """
    tickers = ["MOAT", "VALUE", "DISTRESS", "MEGA"]

    financials = {
        # latest first (index 0), then prior year (index 1)
        "MOAT": [
            fm("MOAT", "FY2024", revenue=55e9, net_income=11e9, earnings_per_share=6.0,
               return_on_equity=0.22, debt_to_equity=0.30, free_cash_flow=9e9,
               shareholders_equity=50e9, current_ratio=1.8, net_profit_margin=0.20),
            fm("MOAT", "FY2023", revenue=48e9, net_income=9e9, earnings_per_share=5.0,
               return_on_equity=0.20, debt_to_equity=0.32, free_cash_flow=8e9,
               shareholders_equity=45e9, current_ratio=1.7, net_profit_margin=0.187),
        ],
        "VALUE": [
            fm("VALUE", "FY2024", revenue=30e9, net_income=4e9, earnings_per_share=8.0,
               return_on_equity=0.12, debt_to_equity=0.20, free_cash_flow=3e9,
               shareholders_equity=25e9, current_ratio=2.5, net_profit_margin=0.133),
            fm("VALUE", "FY2023", revenue=29e9, net_income=3.8e9, earnings_per_share=7.6,
               return_on_equity=0.11, debt_to_equity=0.22, free_cash_flow=2.8e9,
               shareholders_equity=24e9, current_ratio=2.4, net_profit_margin=0.131),
        ],
        "DISTRESS": [
            fm("DISTRESS", "FY2024", revenue=18e9, net_income=-1e9, earnings_per_share=-0.5,
               return_on_equity=-0.05, debt_to_equity=3.0, free_cash_flow=-0.5e9,
               shareholders_equity=8e9, current_ratio=0.8, net_profit_margin=-0.055),
            fm("DISTRESS", "FY2023", revenue=22e9, net_income=0.5e9, earnings_per_share=0.3,
               return_on_equity=0.03, debt_to_equity=2.6, free_cash_flow=0.2e9,
               shareholders_equity=9e9, current_ratio=1.0, net_profit_margin=0.023),
        ],
        "MEGA": [
            fm("MEGA", "FY2024", revenue=380e9, net_income=90e9, earnings_per_share=6.5,
               return_on_equity=0.30, debt_to_equity=0.50, free_cash_flow=80e9,
               shareholders_equity=200e9, current_ratio=1.2, net_profit_margin=0.237),
            fm("MEGA", "FY2023", revenue=350e9, net_income=80e9, earnings_per_share=5.8,
               return_on_equity=0.28, debt_to_equity=0.55, free_cash_flow=72e9,
               shareholders_equity=190e9, current_ratio=1.1, net_profit_margin=0.229),
        ],
    }

    details = {
        "MOAT": CompanyDetails(
            ticker="MOAT", name="Moat Compounders Inc", market_cap=220e9,
            total_employees=60000, share_class_shares_outstanding=15e9,
            weighted_shares_outstanding=15e9,
            description="Global cloud and AI platform with robotics automation.",
        ),
        "VALUE": CompanyDetails(
            ticker="VALUE", name="Value Industrials Corp", market_cap=40e9,
            total_employees=20000, share_class_shares_outstanding=5e9,
            weighted_shares_outstanding=5e9,
            description="Diversified industrial manufacturing conglomerate.",
        ),
        "DISTRESS": CompanyDetails(
            ticker="DISTRESS", name="Distress Retail Co", market_cap=6e9,
            total_employees=8000, share_class_shares_outstanding=4e9,
            weighted_shares_outstanding=4e9,
            description="Legacy brick-and-mortar retail operations.",
        ),
        "MEGA": CompanyDetails(
            ticker="MEGA", name="Mega Cap Technologies", market_cap=2.5e12,
            total_employees=150000, share_class_shares_outstanding=15e9,
            weighted_shares_outstanding=15e9,
            description="Consumer electronics, cloud services and AI at global scale.",
        ),
    }

    prices = {
        "MOAT": make_prices(100, 108, 118),      # +18% / 30d, uptrend
        "VALUE": make_prices(100, 98, 95),       # mild drift down, not oversold
        "DISTRESS": make_prices(100, 95, 78),    # -22% / 30d, -17.9% / 20d (oversold)
        "MEGA": make_prices(100, 110, 125),      # +25% / 30d, strong RS
        "SPY": make_prices(100, 104, 108),       # +8% market trend (druckenmiller ref)
    }

    return {"tickers": tickers, "financials": financials, "details": details, "prices": prices}


def state_from_fixtures(fx: dict) -> dict:
    return {
        "data": {
            "tickers": fx["tickers"],
            "financials": fx["financials"],
            "details": fx["details"],
            "prices": fx["prices"],
        }
    }


def serialize_fixtures(fx: dict) -> dict:
    """JSON-safe form that Phase-3 tests can rehydrate into the same models."""
    return {
        "tickers": fx["tickers"],
        "financials": {
            t: [m.model_dump(mode="json") for m in metrics]
            for t, metrics in fx["financials"].items()
        },
        "details": {t: d.model_dump(mode="json") for t, d in fx["details"].items()},
        "prices": {
            t: [p.model_dump(mode="json") for p in bars]
            for t, bars in fx["prices"].items()
        },
    }


def main() -> None:
    fx = build_fixtures()
    state = state_from_fixtures(fx)

    golden: dict[str, list[dict]] = {}
    for persona_key, (agent_key, agent_func) in sorted(PERSONA_CONFIG.items()):
        result = agent_func(state)
        signals = result["data"]["analyst_signals"][agent_key]
        golden[persona_key] = signals

    payload = {
        "meta": {
            "purpose": "Phase-3 persona parity oracle. Generated from the current "
                       "deterministic persona agents in src/agents/*.py.",
            "generated_from": "src.config.agents.PERSONA_CONFIG",
            "persona_count": len(golden),
            "tickers": fx["tickers"],
            "signal_shape": ["agent_id", "ticker", "signal", "confidence", "reasoning"],
        },
        "fixtures": serialize_fixtures(fx),
        "golden": golden,
    }

    OUT_PATH.write_text(json.dumps(payload, indent=2, sort_keys=False), encoding="utf-8")
    total = sum(len(v) for v in golden.values())
    print(f"Wrote {OUT_PATH}")
    print(f"  personas: {len(golden)}  |  signals: {total}  |  tickers: {len(fx['tickers'])}")
    for k in sorted(golden):
        dirs = ",".join(f"{s['ticker']}:{s['signal']}" for s in golden[k])
        print(f"  {k:14s} {dirs}")


if __name__ == "__main__":
    main()
