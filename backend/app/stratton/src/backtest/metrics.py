"""Performance metrics computation for backtesting."""
from __future__ import annotations
from typing import Optional
from pydantic import BaseModel

from src.backtest.models import PortfolioSnapshot, Trade


class PerformanceMetrics(BaseModel):
    """Summary performance metrics."""
    total_return_pct: Optional[float] = None
    sharpe_ratio: Optional[float] = None
    max_drawdown_pct: Optional[float] = None
    total_trades: int = 0
    win_rate_pct: Optional[float] = None
    profit_factor: Optional[float] = None


def compute_metrics(
    snapshots: list[PortfolioSnapshot],
    trades: list[Trade],
    initial_cash: float,
) -> PerformanceMetrics:
    """Compute key performance metrics from snapshots and trades."""

    if len(snapshots) < 2:
        return PerformanceMetrics(total_trades=len(trades))

    # Total return
    final_value = snapshots[-1].total_value
    total_return = (final_value / initial_cash - 1) * 100

    # Daily returns for Sharpe
    values = [s.total_value for s in snapshots]
    returns = [(values[i] / values[i-1] - 1) for i in range(1, len(values)) if values[i-1] > 0]

    sharpe = None
    if returns:
        avg_ret = sum(returns) / len(returns)
        if len(returns) > 1:
            variance = sum((r - avg_ret) ** 2 for r in returns) / (len(returns) - 1)
            std_dev = variance ** 0.5
            if std_dev > 0:
                sharpe = (avg_ret / std_dev) * (252 ** 0.5)  # Annualized

    # Max drawdown
    peak = values[0]
    max_dd = 0
    for v in values:
        if v > peak:
            peak = v
        dd = (peak - v) / peak * 100 if peak > 0 else 0
        if dd > max_dd:
            max_dd = dd

    # Win rate from round-trip trades
    sells = [t for t in trades if t.action == "sell"]
    wins = 0
    total_profit = 0.0
    total_loss = 0.0

    for sell in sells:
        # Find corresponding buy
        buys = [t for t in trades if t.action == "buy" and t.ticker == sell.ticker and t.date <= sell.date]
        if buys:
            latest_buy = buys[-1]
            pnl = (sell.price - latest_buy.price) * sell.quantity
            if pnl > 0:
                wins += 1
                total_profit += pnl
            else:
                total_loss += abs(pnl)

    win_rate = (wins / len(sells) * 100) if sells else None
    profit_factor = (total_profit / total_loss) if total_loss > 0 else None

    return PerformanceMetrics(
        total_return_pct=round(total_return, 2),
        sharpe_ratio=round(sharpe, 2) if sharpe is not None else None,
        max_drawdown_pct=round(max_dd, 2),
        total_trades=len(trades),
        win_rate_pct=round(win_rate, 2) if win_rate is not None else None,
        profit_factor=round(profit_factor, 2) if profit_factor is not None else None,
    )
