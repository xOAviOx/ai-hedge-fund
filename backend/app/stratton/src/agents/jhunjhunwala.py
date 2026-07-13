"""Rakesh Jhunjhunwala persona — India-style growth + value hybrid."""
from __future__ import annotations
from src.agents._persona_base import create_persona_signal


def jhunjhunwala_agent(state: dict) -> dict:
    data = state.get("data", {})
    signals = []
    for ticker in data.get("tickers", []):
        financials = data.get("financials", {}).get(ticker, [])
        prices = data.get("prices", {}).get(ticker, [])
        bull, bear, factors = 0, 0, []
        if len(financials) >= 2 and prices:
            l, p = financials[0], financials[1]
            # Growth at value — earnings growth + reasonable valuation
            if l.net_income and p.net_income and p.net_income > 0:
                eg = (l.net_income - p.net_income) / abs(p.net_income) * 100
                if eg > 20:
                    bull += 2; factors.append(f"Earnings surge ({eg:.0f}%)")
                elif eg < -10:
                    bear += 1; factors.append("Earnings declining")
            if l.return_on_equity and l.return_on_equity > 0.15:
                bull += 1; factors.append(f"High quality ROE ({l.return_on_equity*100:.0f}%)")
            if len(prices) > 20:
                momentum = (prices[-1].close / prices[-20].close - 1) * 100
                if momentum > 8:
                    bull += 1; factors.append(f"Positive momentum ({momentum:+.0f}%)")
                elif momentum < -10:
                    bear += 1; factors.append("Weak price action")
        signals.append(create_persona_signal("jhunjhunwala_analyst", ticker, bull, bear, factors))
    return {"data": {"analyst_signals": {"jhunjhunwala_analyst": signals}}}
