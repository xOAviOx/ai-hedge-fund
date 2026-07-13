"""Portfolio tracker for backtesting and paper trading."""
from __future__ import annotations
import logging
from datetime import date
from typing import Optional

from src.backtest.models import HoldingSnapshot, PortfolioSnapshot, StopLossConfig, Trade

logger = logging.getLogger(__name__)


class PortfolioTracker:
    """Tracks portfolio state, applies trades, manages stop orders."""

    def __init__(
        self,
        initial_cash: float = 100_000,
        commission_rate: float = 0.001,
        slippage_rate: float = 0.00005,
        stop_loss_config: Optional[StopLossConfig] = None,
    ) -> None:
        self.initial_cash = initial_cash
        self.cash = initial_cash
        self.commission_rate = commission_rate
        self.slippage_rate = slippage_rate
        self.stop_config = stop_loss_config

        self.positions: dict[str, dict] = {}   # ticker -> {shares, avg_cost, high_water_mark}
        self.trades: list[Trade] = []
        self.snapshots: list[PortfolioSnapshot] = []

    def get_portfolio_dict(self) -> dict:
        """Return portfolio as dict for hedge fund workflow input."""
        total = self.cash + sum(
            pos["shares"] * pos["avg_cost"] for pos in self.positions.values()
        )
        return {
            "cash": self.cash,
            "positions": {t: {"shares": p["shares"]} for t, p in self.positions.items()},
            "total_value": total,
        }

    def apply_trades(
        self, portfolio_output: dict, current_prices: dict[str, float], trade_date: date,
    ) -> None:
        """Apply trades from portfolio manager output."""
        for pos in portfolio_output.get("positions", []):
            ticker = pos["ticker"]
            action = pos["action"].lower()
            qty = pos.get("quantity", 0)
            price = current_prices.get(ticker, 0)

            if price <= 0 or qty <= 0:
                continue

            if action == "buy":
                self._execute_buy(ticker, qty, price, trade_date, "signal")
            elif action == "sell":
                self._execute_sell(ticker, qty, price, trade_date, "signal")

    def _execute_buy(self, ticker: str, qty: int, price: float, trade_date: date, trigger: str) -> None:
        commission = qty * price * self.commission_rate
        slippage = qty * price * self.slippage_rate
        total_cost = qty * price + commission + slippage

        if total_cost > self.cash:
            # Reduce quantity to what we can afford
            affordable = self.cash / (price * (1 + self.commission_rate + self.slippage_rate))
            qty = int(affordable)
            if qty <= 0:
                return
            total_cost = qty * price * (1 + self.commission_rate + self.slippage_rate)

        self.cash -= total_cost

        if ticker in self.positions:
            existing = self.positions[ticker]
            old_cost = existing["shares"] * existing["avg_cost"]
            new_cost = qty * price
            total_shares = existing["shares"] + qty
            self.positions[ticker] = {
                "shares": total_shares,
                "avg_cost": (old_cost + new_cost) / total_shares,
                "high_water_mark": max(existing.get("high_water_mark", price), price),
            }
        else:
            self.positions[ticker] = {
                "shares": qty,
                "avg_cost": price,
                "high_water_mark": price,
            }

        self.trades.append(Trade(
            date=trade_date, ticker=ticker, action="buy", quantity=qty,
            price=price, total_value=total_cost, commission=commission,
            slippage=slippage, trigger=trigger,
        ))

    def _execute_sell(self, ticker: str, qty: int, price: float, trade_date: date, trigger: str) -> None:
        if ticker not in self.positions:
            return

        pos = self.positions[ticker]
        qty = min(qty, pos["shares"])
        if qty <= 0:
            return

        commission = qty * price * self.commission_rate
        slippage = qty * price * self.slippage_rate
        proceeds = qty * price - commission - slippage
        self.cash += proceeds

        pos["shares"] -= qty
        if pos["shares"] <= 0:
            del self.positions[ticker]

        self.trades.append(Trade(
            date=trade_date, ticker=ticker, action="sell", quantity=qty,
            price=price, total_value=proceeds, commission=commission,
            slippage=slippage, trigger=trigger,
        ))

    def update_high_water_marks(self, current_prices: dict[str, float]) -> None:
        """Update high water marks with latest prices."""
        for ticker, pos in self.positions.items():
            price = current_prices.get(ticker, 0)
            if price > pos.get("high_water_mark", 0):
                pos["high_water_mark"] = price

    def check_stop_orders(self, current_prices: dict[str, float], trade_date: date) -> None:
        """Check and execute stop-loss / take-profit orders."""
        if not self.stop_config:
            return

        tickers_to_check = list(self.positions.keys())
        for ticker in tickers_to_check:
            if ticker not in self.positions:
                continue
            pos = self.positions[ticker]
            price = current_prices.get(ticker, 0)
            if price <= 0:
                continue

            qty = pos["shares"]
            avg_cost = pos["avg_cost"]

            # Fixed stop-loss
            if self.stop_config.stop_loss_pct:
                stop_price = avg_cost * (1 - self.stop_config.stop_loss_pct)
                if price <= stop_price:
                    logger.info(f"STOP LOSS triggered for {ticker} at ${price:.2f}")
                    self._execute_sell(ticker, qty, price, trade_date, "stop_loss")
                    continue

            # Trailing stop
            if self.stop_config.trailing_stop_pct:
                hwm = pos.get("high_water_mark", avg_cost)
                trail_price = hwm * (1 - self.stop_config.trailing_stop_pct)
                if price <= trail_price:
                    logger.info(f"TRAILING STOP triggered for {ticker} at ${price:.2f}")
                    self._execute_sell(ticker, qty, price, trade_date, "trailing_stop")
                    continue

            # Take profit
            if self.stop_config.take_profit_pct:
                tp_price = avg_cost * (1 + self.stop_config.take_profit_pct)
                if price >= tp_price:
                    logger.info(f"TAKE PROFIT triggered for {ticker} at ${price:.2f}")
                    self._execute_sell(ticker, qty, price, trade_date, "take_profit")
                    continue

    def take_snapshot(self, snap_date: date, current_prices: dict[str, float]) -> None:
        """Record a portfolio snapshot."""
        holdings = {}
        holdings_value = 0

        for ticker, pos in self.positions.items():
            price = current_prices.get(ticker, pos["avg_cost"])
            mkt_val = pos["shares"] * price
            holdings_value += mkt_val
            holdings[ticker] = HoldingSnapshot(
                ticker=ticker,
                shares=pos["shares"],
                avg_cost=pos["avg_cost"],
                current_price=price,
                market_value=mkt_val,
                unrealized_pnl=(price - pos["avg_cost"]) * pos["shares"],
            )

        self.snapshots.append(PortfolioSnapshot(
            date=snap_date,
            cash=self.cash,
            total_value=self.cash + holdings_value,
            holdings=holdings,
        ))
