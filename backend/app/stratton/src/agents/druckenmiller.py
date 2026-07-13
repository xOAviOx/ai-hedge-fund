"""Stanley Druckenmiller persona — macro + momentum."""
from __future__ import annotations
from src.agents._persona_base import create_persona_signal


def druckenmiller_agent(state: dict) -> dict:
    data = state.get("data", {})
    signals = []
    spy_prices = data.get("prices", {}).get("SPY", [])
    spy_trend = 0
    if len(spy_prices) > 30:
        spy_trend = (spy_prices[-1].close / spy_prices[-30].close - 1) * 100

    for ticker in data.get("tickers", []):
        prices = data.get("prices", {}).get(ticker, [])
        bull, bear, factors = 0, 0, []
        if len(prices) > 30:
            ret = (prices[-1].close / prices[-30].close - 1) * 100
            if ret > 10 and spy_trend > 0:
                bull += 2; factors.append(f"Strong momentum ({ret:+.1f}%) + bull market")
            elif ret > 5:
                bull += 1; factors.append(f"Positive momentum ({ret:+.1f}%)")
            elif ret < -10:
                bear += 2; factors.append(f"Negative momentum ({ret:.1f}%)")
            # Relative strength
            if spy_trend != 0:
                alpha = ret - spy_trend
                if alpha > 5:
                    bull += 1; factors.append(f"Outperforming SPY by {alpha:.1f}pp")
                elif alpha < -5:
                    bear += 1; factors.append(f"Underperforming SPY by {abs(alpha):.1f}pp")
        signals.append(create_persona_signal("druckenmiller_analyst", ticker, bull, bear, factors))
    return {"data": {"analyst_signals": {"druckenmiller_analyst": signals}}}
