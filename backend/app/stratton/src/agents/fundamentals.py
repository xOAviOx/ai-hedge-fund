"""Fundamentals analyst agent — value & quality metrics."""
from __future__ import annotations
import logging
from src.data.models import AnalystSignal, SignalType

logger = logging.getLogger(__name__)


def fundamentals_agent(state: dict) -> dict:
    """Analyze fundamental value metrics for each ticker."""
    data = state.get("data", {})
    tickers = data.get("tickers", [])
    signals = []

    for ticker in tickers:
        financials = data.get("financials", {}).get(ticker, [])
        details = data.get("details", {}).get(ticker)
        prices = data.get("prices", {}).get(ticker, [])

        signal = SignalType.NEUTRAL
        confidence = 50.0
        reasoning = "Insufficient fundamental data for deep analysis."

        if financials:
            latest = financials[0]
            pe = None
            pb = None
            roe = latest.return_on_equity
            de = latest.debt_to_equity
            cr = latest.current_ratio

            # Derive PE from price and EPS
            if latest.earnings_per_share and prices:
                current_price = prices[-1].close
                pe = current_price / latest.earnings_per_share if latest.earnings_per_share != 0 else None

            # Derive PB from equity and market cap
            if details and details.market_cap and latest.shareholders_equity:
                pb = details.market_cap / latest.shareholders_equity if latest.shareholders_equity > 0 else None

            factors = []
            bull_count = 0
            bear_count = 0

            if pe is not None:
                if pe < 15:
                    bull_count += 2
                    factors.append(f"Low P/E ({pe:.1f})")
                elif pe < 25:
                    bull_count += 1
                    factors.append(f"Moderate P/E ({pe:.1f})")
                elif pe > 40:
                    bear_count += 2
                    factors.append(f"High P/E ({pe:.1f})")
                else:
                    factors.append(f"P/E at {pe:.1f}")

            if roe is not None:
                if roe > 0.20:
                    bull_count += 2
                    factors.append(f"Strong ROE ({roe*100:.1f}%)")
                elif roe > 0.10:
                    bull_count += 1
                    factors.append(f"Decent ROE ({roe*100:.1f}%)")
                elif roe < 0:
                    bear_count += 2
                    factors.append(f"Negative ROE ({roe*100:.1f}%)")

            if de is not None:
                if de < 0.5:
                    bull_count += 1
                    factors.append(f"Low D/E ({de:.2f})")
                elif de > 2.0:
                    bear_count += 1
                    factors.append(f"High D/E ({de:.2f})")

            if cr is not None:
                if cr > 2.0:
                    bull_count += 1
                    factors.append("Strong liquidity")
                elif cr < 1.0:
                    bear_count += 1
                    factors.append("Weak liquidity")

            if bull_count > bear_count + 1:
                signal = SignalType.BULLISH
                confidence = min(90, 50 + (bull_count - bear_count) * 10)
            elif bear_count > bull_count + 1:
                signal = SignalType.BEARISH
                confidence = min(90, 50 + (bear_count - bull_count) * 10)
            else:
                signal = SignalType.NEUTRAL
                confidence = 50

            reasoning = "; ".join(factors[:4]) if factors else "Fundamentals in line with sector averages."

        signals.append(
            AnalystSignal(
                agent_id="fundamentals_analyst",
                ticker=ticker,
                signal=signal,
                confidence=confidence,
                reasoning=reasoning,
            ).model_dump()
        )

    return {"data": {"analyst_signals": {"fundamentals_analyst": signals}}}
