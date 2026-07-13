"""Growth analyst agent — revenue & earnings trajectory."""
from __future__ import annotations
import logging
from src.data.models import AnalystSignal, SignalType

logger = logging.getLogger(__name__)


def growth_agent(state: dict) -> dict:
    """Analyze revenue and earnings growth trajectory."""
    data = state.get("data", {})
    tickers = data.get("tickers", [])
    signals = []

    for ticker in tickers:
        financials = data.get("financials", {}).get(ticker, [])

        signal = SignalType.NEUTRAL
        confidence = 50.0
        reasoning = "Insufficient financial history for growth analysis."

        if len(financials) >= 2:
            latest = financials[0]
            previous = financials[1]
            factors = []
            bull_pts = 0
            bear_pts = 0

            # Revenue growth
            if latest.revenue and previous.revenue and previous.revenue > 0:
                rev_growth = (latest.revenue - previous.revenue) / abs(previous.revenue) * 100
                if rev_growth > 15:
                    bull_pts += 2
                    factors.append(f"Revenue growth {rev_growth:.1f}% — accelerating")
                elif rev_growth > 5:
                    bull_pts += 1
                    factors.append(f"Steady revenue growth {rev_growth:.1f}%")
                elif rev_growth < -5:
                    bear_pts += 2
                    factors.append(f"Revenue declining {rev_growth:.1f}%")
                else:
                    factors.append(f"Flat revenue ({rev_growth:+.1f}%)")

            # Net income growth
            if latest.net_income and previous.net_income and previous.net_income > 0:
                ni_growth = (latest.net_income - previous.net_income) / abs(previous.net_income) * 100
                if ni_growth > 20:
                    bull_pts += 2
                    factors.append(f"Earnings surging {ni_growth:.1f}%")
                elif ni_growth > 5:
                    bull_pts += 1
                    factors.append(f"Earnings growing {ni_growth:.1f}%")
                elif ni_growth < -10:
                    bear_pts += 2
                    factors.append(f"Earnings contracting {ni_growth:.1f}%")

            # Margin expansion
            if latest.gross_profit_margin and previous.gross_profit_margin:
                margin_delta = (latest.gross_profit_margin - previous.gross_profit_margin) * 100
                if margin_delta > 2:
                    bull_pts += 1
                    factors.append(f"Margin expanding (+{margin_delta:.1f}pp)")
                elif margin_delta < -2:
                    bear_pts += 1
                    factors.append(f"Margin compressing ({margin_delta:.1f}pp)")

            # Cash flow growth
            if latest.operating_cash_flow and previous.operating_cash_flow and previous.operating_cash_flow > 0:
                ocf_growth = (latest.operating_cash_flow - previous.operating_cash_flow) / abs(previous.operating_cash_flow) * 100
                if ocf_growth > 15:
                    bull_pts += 1
                    factors.append(f"Cash flow growing {ocf_growth:.0f}%")
                elif ocf_growth < -15:
                    bear_pts += 1
                    factors.append(f"Cash flow declining {ocf_growth:.0f}%")

            if bull_pts > bear_pts + 1:
                signal = SignalType.BULLISH
                confidence = min(90, 55 + bull_pts * 8)
            elif bear_pts > bull_pts + 1:
                signal = SignalType.BEARISH
                confidence = min(90, 55 + bear_pts * 8)
            else:
                signal = SignalType.NEUTRAL
                confidence = 50 + abs(bull_pts - bear_pts) * 5

            reasoning = "; ".join(factors[:3]) if factors else "Growth trajectory stable."

        signals.append(
            AnalystSignal(
                agent_id="growth_analyst",
                ticker=ticker,
                signal=signal,
                confidence=confidence,
                reasoning=reasoning,
            ).model_dump()
        )

    return {"data": {"analyst_signals": {"growth_analyst": signals}}}
