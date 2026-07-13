"""Warren Buffett persona — value investing with moat focus."""
from __future__ import annotations
from src.agents._persona_base import create_persona_signal


def buffett_agent(state: dict) -> dict:
    data = state.get("data", {})
    tickers = data.get("tickers", [])
    signals = []

    for ticker in tickers:
        financials = data.get("financials", {}).get(ticker, [])
        details = data.get("details", {}).get(ticker)
        prices = data.get("prices", {}).get(ticker, [])
        bull, bear, factors = 0, 0, []

        if financials:
            latest = financials[0]
            # ROE > 15% — Buffett loves consistent ROE
            if latest.return_on_equity and latest.return_on_equity > 0.15:
                bull += 2
                factors.append(f"Durable ROE ({latest.return_on_equity*100:.1f}%)")
            elif latest.return_on_equity and latest.return_on_equity < 0.08:
                bear += 1
                factors.append("Mediocre ROE")

            # Low debt preference
            if latest.debt_to_equity and latest.debt_to_equity < 0.5:
                bull += 1
                factors.append("Conservative balance sheet")
            elif latest.debt_to_equity and latest.debt_to_equity > 2:
                bear += 2
                factors.append("Excessive leverage")

            # Strong free cash flow
            if latest.free_cash_flow and latest.free_cash_flow > 0:
                bull += 1
                factors.append("Positive FCF — cash-generative")

            # Margin of safety — PE under 20
            if latest.earnings_per_share and prices and latest.earnings_per_share > 0:
                pe = prices[-1].close / latest.earnings_per_share
                if pe < 20:
                    bull += 1
                    factors.append(f"Margin of safety (P/E {pe:.1f})")
                elif pe > 35:
                    bear += 1
                    factors.append(f"Expensive entry (P/E {pe:.1f})")

        signals.append(create_persona_signal("buffett_analyst", ticker, bull, bear, factors))

    return {"data": {"analyst_signals": {"buffett_analyst": signals}}}
