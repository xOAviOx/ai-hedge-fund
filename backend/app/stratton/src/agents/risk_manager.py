"""Risk manager agent — aggregates analyst signals into risk-adjusted output."""
from __future__ import annotations
import logging
from src.data.models import SignalType

logger = logging.getLogger(__name__)


def risk_manager_agent(state: dict) -> dict:
    """Aggregate all analyst signals into risk-adjusted consensus."""
    data = state.get("data", {})
    tickers = data.get("tickers", [])
    analyst_signals = data.get("analyst_signals", {})
    prices = data.get("prices", {})

    risk_adjusted = []

    for ticker in tickers:
        bull = 0
        bear = 0
        total_conf = 0
        n = 0

        for agent_id, agent_signals in analyst_signals.items():
            for sig in agent_signals:
                if sig.get("ticker") == ticker:
                    s = sig.get("signal", "neutral").lower()
                    conf = sig.get("confidence", 50)
                    if s == "bullish":
                        bull += 1
                    elif s == "bearish":
                        bear += 1
                    total_conf += conf
                    n += 1

        # Weighted consensus
        if n > 0:
            avg_conf = total_conf / n

            if bull > bear + 1:
                consensus = "bullish"
                adj_conf = min(90, int(avg_conf * (bull / n)))
                max_pos = 25000
            elif bear > bull + 1:
                consensus = "bearish"
                adj_conf = min(90, int(avg_conf * (bear / n)))
                max_pos = 5000
            else:
                consensus = "neutral"
                adj_conf = int(avg_conf * 0.6)
                max_pos = 10000
        else:
            consensus = "neutral"
            adj_conf = 0
            max_pos = 0

        # Get current price
        ticker_prices = prices.get(ticker, [])
        current_price = ticker_prices[-1].close if ticker_prices else 0

        risk_adjusted.append({
            "ticker": ticker,
            "signal": consensus,
            "confidence": adj_conf,
            "max_position_size": max_pos,
            "bull_count": bull,
            "bear_count": bear,
        })

    # Store current prices
    current_prices = {}
    for ticker in tickers:
        ticker_prices = prices.get(ticker, [])
        if ticker_prices:
            current_prices[ticker] = ticker_prices[-1].close

    return {
        "data": {
            "risk_adjusted_signals": risk_adjusted,
            "current_prices": current_prices,
        }
    }
