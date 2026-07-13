"""Valuation analyst agent — DCF & multiples analysis."""
from __future__ import annotations
import logging
from src.data.models import AnalystSignal, SignalType

logger = logging.getLogger(__name__)


def valuation_agent(state: dict) -> dict:
    """Analyze valuation multiples and intrinsic value."""
    data = state.get("data", {})
    tickers = data.get("tickers", [])
    signals = []

    for ticker in tickers:
        financials = data.get("financials", {}).get(ticker, [])
        details = data.get("details", {}).get(ticker)
        prices = data.get("prices", {}).get(ticker, [])

        signal = SignalType.NEUTRAL
        confidence = 55.0
        reasoning = "Insufficient data for valuation analysis."

        if financials and prices:
            latest = financials[0]
            current_price = prices[-1].close

            factors = []
            bull_pts = 0
            bear_pts = 0

            # Price to Earnings
            if latest.earnings_per_share and latest.earnings_per_share > 0:
                pe = current_price / latest.earnings_per_share
                if pe < 15:
                    bull_pts += 2
                    factors.append(f"Attractive P/E of {pe:.1f}")
                elif pe > 35:
                    bear_pts += 2
                    factors.append(f"Expensive P/E of {pe:.1f}")
                else:
                    factors.append(f"P/E at {pe:.1f}")

            # Price to Book
            if details and details.market_cap and latest.shareholders_equity:
                if latest.shareholders_equity > 0:
                    pb = details.market_cap / latest.shareholders_equity
                    if pb < 1.5:
                        bull_pts += 2
                        factors.append(f"Below book value (P/B={pb:.2f})")
                    elif pb > 5:
                        bear_pts += 1
                        factors.append(f"High P/B of {pb:.2f}")

            # Free Cash Flow Yield
            if latest.free_cash_flow and details and details.market_cap:
                if details.market_cap > 0:
                    fcf_yield = (latest.free_cash_flow / details.market_cap) * 100
                    if fcf_yield > 5:
                        bull_pts += 2
                        factors.append(f"Strong FCF yield ({fcf_yield:.1f}%)")
                    elif fcf_yield < 1:
                        bear_pts += 1
                        factors.append(f"Low FCF yield ({fcf_yield:.1f}%)")

            # Earnings growth (if we have 2+ periods)
            if len(financials) >= 2:
                prev = financials[1]
                if latest.net_income and prev.net_income and prev.net_income > 0:
                    growth = (latest.net_income - prev.net_income) / abs(prev.net_income) * 100
                    if growth > 15:
                        bull_pts += 1
                        factors.append(f"Earnings growing {growth:.0f}% YoY")
                    elif growth < -10:
                        bear_pts += 1
                        factors.append(f"Earnings declining {growth:.0f}% YoY")

            if bull_pts > bear_pts + 1:
                signal = SignalType.BULLISH
                confidence = min(85, 55 + bull_pts * 8)
            elif bear_pts > bull_pts + 1:
                signal = SignalType.BEARISH
                confidence = min(85, 55 + bear_pts * 8)
            else:
                signal = SignalType.NEUTRAL
                confidence = 55

            reasoning = "; ".join(factors[:4]) if factors else "Valuation metrics suggest fair value."

        signals.append(
            AnalystSignal(
                agent_id="valuation_analyst",
                ticker=ticker,
                signal=signal,
                confidence=confidence,
                reasoning=reasoning,
            ).model_dump()
        )

    return {"data": {"analyst_signals": {"valuation_analyst": signals}}}
