"""Aswath Damodaran persona — intrinsic valuation focus."""
from __future__ import annotations
from src.agents._persona_base import create_persona_signal


def damodaran_agent(state: dict) -> dict:
    data = state.get("data", {})
    signals = []
    for ticker in data.get("tickers", []):
        financials = data.get("financials", {}).get(ticker, [])
        details = data.get("details", {}).get(ticker)
        prices = data.get("prices", {}).get(ticker, [])
        bull, bear, factors = 0, 0, []
        if financials and prices:
            l = financials[0]
            price = prices[-1].close
            # FCF yield valuation
            if l.free_cash_flow and details and details.market_cap and details.market_cap > 0:
                fcf_yield = l.free_cash_flow / details.market_cap * 100
                if fcf_yield > 6:
                    bull += 2; factors.append(f"High FCF yield ({fcf_yield:.1f}%) — undervalued")
                elif fcf_yield < 1:
                    bear += 1; factors.append(f"Low FCF yield ({fcf_yield:.1f}%)")
            # Cost of capital check via debt
            if l.debt_to_equity and l.debt_to_equity < 0.8:
                bull += 1; factors.append("Efficient capital structure")
            # Revenue quality
            if l.revenue and l.net_income and l.revenue > 0:
                margin = l.net_income / l.revenue * 100
                if margin > 20:
                    bull += 1; factors.append(f"Strong margin ({margin:.0f}%)")
                elif margin < 0:
                    bear += 2; factors.append("Unprofitable")
        signals.append(create_persona_signal("damodaran_analyst", ticker, bull, bear, factors))
    return {"data": {"analyst_signals": {"damodaran_analyst": signals}}}
