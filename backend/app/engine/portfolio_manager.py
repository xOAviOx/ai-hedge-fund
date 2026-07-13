"""Portfolio manager agent — makes final allocation decisions."""
from __future__ import annotations
import logging

logger = logging.getLogger(__name__)


def portfolio_manager_agent(state: dict) -> dict:
    """Convert risk-adjusted signals into portfolio positions."""
    data = state.get("data", {})
    risk_signals = data.get("risk_adjusted_signals", [])
    portfolio = data.get("portfolio", {"cash": 100000, "positions": {}, "total_value": 100000})
    current_prices = data.get("current_prices", {})

    cash = portfolio.get("cash", 100000)
    existing = portfolio.get("positions", {})
    positions = []

    for rs in risk_signals:
        ticker = rs["ticker"]
        signal = rs["signal"].lower()
        conf = rs["confidence"]
        max_pos = rs.get("max_position_size", 10000)

        price = current_prices.get(ticker, 0)
        if price <= 0:
            positions.append({
                "ticker": ticker,
                "action": "hold",
                "quantity": 0,
                "confidence": conf,
                "reasoning": f"No price data available for {ticker}.",
            })
            continue

        if signal == "bullish" and conf >= 50:
            # Allocate up to max_position_size or remaining cash
            alloc = min(max_pos, cash * 0.3)
            qty = int(alloc / price) if price > 0 else 0
            if qty > 0:
                action = "buy"
                reasoning = f"Bullish conviction ({conf}%). Allocating ${alloc:,.0f} for {qty} shares at ${price:.2f}."
            else:
                action = "hold"
                reasoning = f"Bullish signal but insufficient allocation for {ticker}."
        elif signal == "bearish" and conf >= 60:
            # Check if we hold shares to sell
            held = existing.get(ticker, {})
            held_qty = held.get("shares", held.get("quantity", 0)) if isinstance(held, dict) else 0
            if held_qty > 0:
                action = "sell"
                qty = held_qty
                reasoning = f"Bearish conviction ({conf}%). Liquidating {qty} shares."
            else:
                action = "hold"
                qty = 0
                reasoning = f"Bearish on {ticker} but no position to liquidate."
        else:
            action = "hold"
            qty = existing.get(ticker, {}).get("shares", 0) if isinstance(existing.get(ticker), dict) else 0
            reasoning = f"Neutral outlook ({conf}%). Maintaining current position."

        positions.append({
            "ticker": ticker,
            "action": action,
            "quantity": qty,
            "confidence": conf,
            "reasoning": reasoning,
        })

    # Calculate portfolio value
    total = cash
    for pos in positions:
        if pos["action"] == "buy":
            cost = pos["quantity"] * current_prices.get(pos["ticker"], 0)
            total += cost  # These shares become value
            cash -= cost

    return {
        "data": {
            "portfolio_output": {
                "positions": positions,
                "cash_remaining": max(0, cash),
                "total_value": portfolio.get("total_value", 100000),
            }
        }
    }
