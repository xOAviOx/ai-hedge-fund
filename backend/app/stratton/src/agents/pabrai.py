"""Mohnish Pabrai persona — Buffett-style value with concentrated bets."""
from __future__ import annotations
from src.agents._persona_base import create_persona_signal


def pabrai_agent(state: dict) -> dict:
    data = state.get("data", {})
    signals = []
    for ticker in data.get("tickers", []):
        financials = data.get("financials", {}).get(ticker, [])
        prices = data.get("prices", {}).get(ticker, [])
        bull, bear, factors = 0, 0, []
        if financials and prices:
            l = financials[0]
            price = prices[-1].close
            # Low downside / high upside asymmetry
            if l.earnings_per_share and l.earnings_per_share > 0:
                pe = price / l.earnings_per_share
                if pe < 12:
                    bull += 3; factors.append(f"Deep value PE ({pe:.1f}) — high asymmetry")
                elif pe > 35:
                    bear += 1; factors.append("Expensive")
            if l.free_cash_flow and l.free_cash_flow > 0:
                bull += 1; factors.append("Strong cash generation")
            if l.debt_to_equity and l.debt_to_equity < 0.3:
                bull += 1; factors.append("Minimal debt — dhandho approved")
        signals.append(create_persona_signal("pabrai_analyst", ticker, bull, bear, factors))
    return {"data": {"analyst_signals": {"pabrai_analyst": signals}}}
