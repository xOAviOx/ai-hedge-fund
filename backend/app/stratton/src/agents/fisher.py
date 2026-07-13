"""Philip Fisher persona — scuttlebutt growth investing."""
from __future__ import annotations
from src.agents._persona_base import create_persona_signal


def fisher_agent(state: dict) -> dict:
    data = state.get("data", {})
    signals = []
    for ticker in data.get("tickers", []):
        financials = data.get("financials", {}).get(ticker, [])
        details = data.get("details", {}).get(ticker)
        bull, bear, factors = 0, 0, []
        if len(financials) >= 2:
            l, p = financials[0], financials[1]
            # R&D / revenue growth
            if l.revenue and p.revenue and p.revenue > 0:
                rg = (l.revenue - p.revenue) / abs(p.revenue) * 100
                if rg > 15:
                    bull += 2; factors.append(f"Strong revenue growth ({rg:.0f}%)")
                elif rg < 0:
                    bear += 1; factors.append("Revenue declining")
            if l.net_profit_margin and l.net_profit_margin > 0.10:
                bull += 1; factors.append(f"Healthy margins ({l.net_profit_margin*100:.0f}%)")
        if details and details.total_employees and details.total_employees > 1000:
            bull += 1; factors.append("Established team")
        signals.append(create_persona_signal("fisher_analyst", ticker, bull, bear, factors))
    return {"data": {"analyst_signals": {"fisher_analyst": signals}}}
