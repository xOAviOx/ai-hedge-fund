"""Ben Graham persona — deep value and margin of safety."""
from __future__ import annotations
from src.agents._persona_base import create_persona_signal


def graham_agent(state: dict) -> dict:
    data = state.get("data", {})
    tickers = data.get("tickers", [])
    signals = []

    for ticker in tickers:
        financials = data.get("financials", {}).get(ticker, [])
        details = data.get("details", {}).get(ticker)
        prices = data.get("prices", {}).get(ticker, [])
        bull, bear, factors = 0, 0, []

        if financials and prices:
            latest = financials[0]
            price = prices[-1].close

            # Graham number: sqrt(22.5 * EPS * Book)
            if latest.earnings_per_share and latest.shareholders_equity and details:
                shares_out = details.share_class_shares_outstanding or details.weighted_shares_outstanding
                if shares_out and shares_out > 0:
                    bvps = latest.shareholders_equity / shares_out
                    if latest.earnings_per_share > 0 and bvps > 0:
                        graham_num = (22.5 * latest.earnings_per_share * bvps) ** 0.5
                        if price < graham_num * 0.8:
                            bull += 3
                            factors.append(f"Below Graham number (${graham_num:.0f} vs ${price:.0f})")
                        elif price > graham_num * 1.2:
                            bear += 2
                            factors.append(f"Above Graham number")

            # Current ratio > 2
            if latest.current_ratio and latest.current_ratio > 2:
                bull += 1
                factors.append(f"Strong current ratio ({latest.current_ratio:.1f})")
            elif latest.current_ratio and latest.current_ratio < 1:
                bear += 1
                factors.append("Weak current ratio")

            # P/E < 15
            if latest.earnings_per_share and latest.earnings_per_share > 0:
                pe = price / latest.earnings_per_share
                if pe < 15:
                    bull += 2
                    factors.append(f"Low P/E ({pe:.1f})")
                elif pe > 30:
                    bear += 1

        signals.append(create_persona_signal("graham_analyst", ticker, bull, bear, factors))

    return {"data": {"analyst_signals": {"graham_analyst": signals}}}
