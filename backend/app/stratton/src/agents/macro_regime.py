"""Macro regime analyst agent — rates, liquidity & sector rotation."""
from __future__ import annotations
import logging
from src.data.models import AnalystSignal, SignalType

logger = logging.getLogger(__name__)

# Sector ETFs used for rotation analysis
SECTOR_ETFS = {
    "XLK": "Technology",
    "XLF": "Financials",
    "XLE": "Energy",
    "XLV": "Healthcare",
    "XLI": "Industrials",
    "XLY": "Consumer Discretionary",
    "XLP": "Consumer Staples",
    "XLU": "Utilities",
}


def macro_regime_agent(state: dict) -> dict:
    """Analyze macro regime via beta, sector rotation, market breadth."""
    data = state.get("data", {})
    tickers = data.get("tickers", [])
    signals = []

    # SPY benchmark
    spy_prices = data.get("prices", {}).get("SPY", [])
    spy_return = 0
    if len(spy_prices) > 20:
        spy_return = (spy_prices[-1].close / spy_prices[-20].close - 1) * 100

    # Sector performance
    sector_perf = {}
    for etf in SECTOR_ETFS:
        etf_prices = data.get("prices", {}).get(etf, [])
        if len(etf_prices) > 20:
            sector_perf[etf] = (etf_prices[-1].close / etf_prices[-20].close - 1) * 100

    for ticker in tickers:
        prices = data.get("prices", {}).get(ticker, [])

        signal = SignalType.NEUTRAL
        confidence = 60.0
        reasoning = "Insufficient macro context."

        if len(prices) > 20 and len(spy_prices) > 20:
            factors = []
            bull_pts = 0
            bear_pts = 0

            # Calculate beta
            stock_returns = [(prices[i].close / prices[i-1].close - 1) for i in range(1, len(prices))]
            spy_returns = [(spy_prices[i].close / spy_prices[i-1].close - 1) for i in range(1, min(len(spy_prices), len(prices)))]

            n = min(len(stock_returns), len(spy_returns))
            if n > 10:
                stock_r = stock_returns[-n:]
                spy_r = spy_returns[-n:]
                spy_mean = sum(spy_r) / n
                stock_mean = sum(stock_r) / n
                covar = sum((s - stock_mean) * (m - spy_mean) for s, m in zip(stock_r, spy_r)) / n
                spy_var = sum((m - spy_mean) ** 2 for m in spy_r) / n
                beta = covar / spy_var if spy_var > 0 else 1.0

                if beta > 1.3:
                    bear_pts += 1
                    factors.append(f"High beta ({beta:.2f}) — amplified market risk")
                elif beta < 0.7 and beta > 0:
                    bull_pts += 1
                    factors.append(f"Low beta ({beta:.2f}) — defensive profile")
                else:
                    factors.append(f"Beta {beta:.2f} — market correlated")

            # Market regime
            if spy_return > 3:
                bull_pts += 1
                factors.append(f"Bull market regime (SPY +{spy_return:.1f}%)")
            elif spy_return < -3:
                bear_pts += 1
                factors.append(f"Bear market pressure (SPY {spy_return:.1f}%)")
            else:
                factors.append(f"Range-bound market (SPY {spy_return:+.1f}%)")

            # Sector rotation insight
            if sector_perf:
                best = max(sector_perf, key=sector_perf.get)
                worst = min(sector_perf, key=sector_perf.get)
                factors.append(f"Rotation: {SECTOR_ETFS.get(best, best)} leads, {SECTOR_ETFS.get(worst, worst)} lags")

            if bull_pts > bear_pts:
                signal = SignalType.BULLISH
                confidence = min(80, 55 + bull_pts * 8)
            elif bear_pts > bull_pts:
                signal = SignalType.BEARISH
                confidence = min(80, 55 + bear_pts * 8)
            else:
                signal = SignalType.NEUTRAL
                confidence = 60

            reasoning = "; ".join(factors[:3])

        signals.append(
            AnalystSignal(
                agent_id="macro_regime_analyst",
                ticker=ticker,
                signal=signal,
                confidence=confidence,
                reasoning=reasoning,
            ).model_dump()
        )

    return {"data": {"analyst_signals": {"macro_regime_analyst": signals}}}
