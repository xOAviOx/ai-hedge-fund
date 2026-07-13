"""Bill Ackman persona — activist value with catalysts."""
from __future__ import annotations
from src.agents._persona_base import create_persona_signal


def ackman_agent(state: dict) -> dict:
    data = state.get("data", {})
    signals = []
    for ticker in data.get("tickers", []):
        financials = data.get("financials", {}).get(ticker, [])
        details = data.get("details", {}).get(ticker)
        bull, bear, factors = 0, 0, []
        if financials:
            l = financials[0]
            if l.free_cash_flow and l.free_cash_flow > 0 and l.revenue and l.revenue > 0:
                fcf_margin = l.free_cash_flow / l.revenue * 100
                if fcf_margin > 15:
                    bull += 2; factors.append(f"Strong FCF margin ({fcf_margin:.0f}%)")
            if l.net_profit_margin and l.net_profit_margin < 0.10 and l.return_on_equity and l.return_on_equity > 0.10:
                bull += 1; factors.append("Margin expansion opportunity — activist catalyst")
            if l.debt_to_equity and l.debt_to_equity > 2.5:
                bear += 2; factors.append("Excessive leverage — restructuring risk")
        if details and details.market_cap and details.market_cap > 5e9:
            bull += 1; factors.append("Large-cap — suitable for activist strategy")
        signals.append(create_persona_signal("ackman_analyst", ticker, bull, bear, factors))
    return {"data": {"analyst_signals": {"ackman_analyst": signals}}}
