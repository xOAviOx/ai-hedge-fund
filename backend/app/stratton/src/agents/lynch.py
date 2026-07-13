"""Peter Lynch persona — growth at a reasonable price (GARP)."""
from __future__ import annotations
from src.agents._persona_base import create_persona_signal


def lynch_agent(state: dict) -> dict:
    data = state.get("data", {})
    signals = []
    for ticker in data.get("tickers", []):
        financials = data.get("financials", {}).get(ticker, [])
        prices = data.get("prices", {}).get(ticker, [])
        bull, bear, factors = 0, 0, []
        if len(financials) >= 2 and prices:
            l, p = financials[0], financials[1]
            price = prices[-1].close
            # PEG ratio logic
            if l.earnings_per_share and l.earnings_per_share > 0 and p.earnings_per_share and p.earnings_per_share > 0:
                pe = price / l.earnings_per_share
                eg = (l.earnings_per_share - p.earnings_per_share) / abs(p.earnings_per_share) * 100
                if eg > 0:
                    peg = pe / eg
                    if peg < 1:
                        bull += 3; factors.append(f"PEG < 1 ({peg:.2f}) — classic Lynch buy")
                    elif peg < 2:
                        bull += 1; factors.append(f"Reasonable PEG ({peg:.2f})")
                    elif peg > 3:
                        bear += 1; factors.append(f"PEG too high ({peg:.2f})")
            if l.revenue and p.revenue and p.revenue > 0:
                rg = (l.revenue - p.revenue) / abs(p.revenue) * 100
                if rg > 10:
                    bull += 1; factors.append(f"Revenue growing {rg:.0f}%")
        signals.append(create_persona_signal("lynch_analyst", ticker, bull, bear, factors))
    return {"data": {"analyst_signals": {"lynch_analyst": signals}}}
