"""Charlie Munger persona — quality at fair price."""
from __future__ import annotations
from src.agents._persona_base import create_persona_signal


def munger_agent(state: dict) -> dict:
    data = state.get("data", {})
    signals = []
    for ticker in data.get("tickers", []):
        financials = data.get("financials", {}).get(ticker, [])
        prices = data.get("prices", {}).get(ticker, [])
        bull, bear, factors = 0, 0, []
        if financials:
            l = financials[0]
            if l.return_on_equity and l.return_on_equity > 0.20:
                bull += 2; factors.append(f"High-quality ROE ({l.return_on_equity*100:.0f}%)")
            if l.net_profit_margin and l.net_profit_margin > 0.15:
                bull += 1; factors.append("Wide margins — pricing power")
            elif l.net_profit_margin and l.net_profit_margin < 0.05:
                bear += 1; factors.append("Thin margins")
            if l.debt_to_equity and l.debt_to_equity < 0.5:
                bull += 1; factors.append("Low leverage")
            elif l.debt_to_equity and l.debt_to_equity > 1.5:
                bear += 1; factors.append("Too much debt for Munger")
        signals.append(create_persona_signal("munger_analyst", ticker, bull, bear, factors))
    return {"data": {"analyst_signals": {"munger_analyst": signals}}}
