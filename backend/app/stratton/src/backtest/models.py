"""Backtesting data models — trades, snapshots, stop-loss configs."""
from __future__ import annotations
from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel, Field


class Trade(BaseModel):
    """A single executed trade."""
    date: date
    ticker: str
    action: str  # "buy" or "sell"
    quantity: int
    price: float
    total_value: float = 0.0
    commission: float = 0.0
    slippage: float = 0.0
    trigger: str = "signal"  # "signal", "stop_loss", "trailing_stop", "take_profit", "manual"


class HoldingSnapshot(BaseModel):
    """A snapshot of a single holding at a point in time."""
    ticker: str
    shares: int
    avg_cost: float
    current_price: float
    market_value: float
    unrealized_pnl: float


class PortfolioSnapshot(BaseModel):
    """A snapshot of the entire portfolio at a point in time."""
    date: date
    cash: float
    total_value: float
    holdings: dict[str, HoldingSnapshot] = Field(default_factory=dict)


class StopLossConfig(BaseModel):
    """Stop-loss / take-profit configuration."""
    stop_loss_pct: Optional[float] = None       # Fixed stop-loss (e.g., 0.10 = 10%)
    trailing_stop_pct: Optional[float] = None   # Trailing stop (e.g., 0.10 = 10%)
    take_profit_pct: Optional[float] = None     # Take-profit (e.g., 0.20 = 20%)
