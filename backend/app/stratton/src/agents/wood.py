"""Cathie Wood persona — disruptive innovation growth."""
from __future__ import annotations
from src.agents._persona_base import create_persona_signal


def wood_agent(state: dict) -> dict:
    data = state.get("data", {})
    signals = []
    for ticker in data.get("tickers", []):
        financials = data.get("financials", {}).get(ticker, [])
        details = data.get("details", {}).get(ticker)
        bull, bear, factors = 0, 0, []
        if len(financials) >= 2:
            l, p = financials[0], financials[1]
            if l.revenue and p.revenue and p.revenue > 0:
                rg = (l.revenue - p.revenue) / abs(p.revenue) * 100
                if rg > 25:
                    bull += 3; factors.append(f"Hyper-growth revenue ({rg:.0f}%)")
                elif rg > 10:
                    bull += 1; factors.append(f"Solid revenue growth ({rg:.0f}%)")
                elif rg < 0:
                    bear += 2; factors.append("Revenue contraction — avoid")
        if details and details.description:
            desc = details.description.lower()
            innovation_kws = ["ai", "autonomous", "genomics", "blockchain", "electric", "cloud", "robotics", "fintech"]
            hits = sum(1 for kw in innovation_kws if kw in desc)
            if hits >= 2:
                bull += 2; factors.append("Disruptive innovation exposure")
        signals.append(create_persona_signal("wood_analyst", ticker, bull, bear, factors))
    return {"data": {"analyst_signals": {"wood_analyst": signals}}}
