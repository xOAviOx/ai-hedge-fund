"""Michael Burry persona — contrarian deep value."""
from __future__ import annotations
from src.agents._persona_base import create_persona_signal


def burry_agent(state: dict) -> dict:
    data = state.get("data", {})
    signals = []
    for ticker in data.get("tickers", []):
        financials = data.get("financials", {}).get(ticker, [])
        prices = data.get("prices", {}).get(ticker, [])
        bull, bear, factors = 0, 0, []
        if prices and len(prices) > 20:
            # Look for beaten-down stocks (contrarian)
            ret_20d = (prices[-1].close / prices[-20].close - 1) * 100
            if ret_20d < -15:
                bull += 2; factors.append(f"Oversold ({ret_20d:.1f}% drop) — contrarian opportunity")
            elif ret_20d > 20:
                bear += 1; factors.append(f"Overextended rally ({ret_20d:.1f}%)")
        if financials:
            l = financials[0]
            if l.free_cash_flow and l.free_cash_flow > 0:
                bull += 1; factors.append("Cash generative")
            if l.debt_to_equity and l.debt_to_equity > 2:
                bear += 2; factors.append("Dangerous leverage")
        signals.append(create_persona_signal("burry_analyst", ticker, bull, bear, factors))
    return {"data": {"analyst_signals": {"burry_analyst": signals}}}
