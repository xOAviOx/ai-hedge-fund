"""Provider protocol + normalized return models.

Every provider returns these normalized pydantic models regardless of the
upstream source, so the cache and the engine never see provider-specific shapes.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional, Protocol, runtime_checkable

from pydantic import BaseModel, Field


# ── Normalized return models ────────────────────────────────────────────

class Quote(BaseModel):
    symbol: str
    price: float
    currency: Optional[str] = None
    previous_close: Optional[float] = None
    change: Optional[float] = None
    change_pct: Optional[float] = None
    ts: datetime


class OHLCVBar(BaseModel):
    ts: datetime
    open: float
    high: float
    low: float
    close: float
    volume: Optional[float] = None  # indices like ^NSEI have no volume


class OHLCV(BaseModel):
    symbol: str
    interval: str
    bars: list[OHLCVBar] = Field(default_factory=list)


class FinancialsPeriod(BaseModel):
    """One reporting period. Field names mirror what the engine's agents read."""
    period: str  # e.g. "2024-03-31"
    fiscal_period: Optional[str] = None
    filing_date: Optional[str] = None
    revenue: Optional[float] = None
    net_income: Optional[float] = None
    earnings_per_share: Optional[float] = None
    total_assets: Optional[float] = None
    total_liabilities: Optional[float] = None
    shareholders_equity: Optional[float] = None
    operating_cash_flow: Optional[float] = None
    free_cash_flow: Optional[float] = None
    gross_profit_margin: Optional[float] = None
    net_profit_margin: Optional[float] = None
    return_on_equity: Optional[float] = None
    debt_to_equity: Optional[float] = None
    current_ratio: Optional[float] = None


class Financials(BaseModel):
    symbol: str
    periods: list[FinancialsPeriod] = Field(default_factory=list)


class NewsItem(BaseModel):
    title: str
    publisher: Optional[str] = None
    link: Optional[str] = None
    published: Optional[datetime] = None
    summary: Optional[str] = None


class News(BaseModel):
    symbol: str
    items: list[NewsItem] = Field(default_factory=list)


class FxRate(BaseModel):
    pair: str  # e.g. "USDINR"
    rate: float
    ts: datetime


class TickerDetails(BaseModel):
    symbol: str
    name: Optional[str] = None
    sector: Optional[str] = None
    industry: Optional[str] = None
    market_cap: Optional[float] = None
    currency: Optional[str] = None
    exchange: Optional[str] = None
    employees: Optional[int] = None
    description: Optional[str] = None
    shares_outstanding: Optional[float] = None


# ── Errors ──────────────────────────────────────────────────────────────

class ProviderError(Exception):
    """Base for provider failures."""


class SymbolNotFound(ProviderError):
    """Empty/unknown symbol — callers should surface a clean 404, not a 500."""


# ── Protocol ────────────────────────────────────────────────────────────

@runtime_checkable
class MarketDataProvider(Protocol):
    name: str

    async def get_quote(self, symbol: str) -> Quote: ...

    async def get_ohlcv(
        self,
        symbol: str,
        interval: str = "1d",
        start: Optional[str] = None,
        end: Optional[str] = None,
    ) -> OHLCV: ...

    async def get_financials(self, symbol: str, quarters: int = 8) -> Financials: ...

    async def get_news(self, symbol: str, limit: int = 20) -> News: ...

    async def get_fx(self, pair: str) -> FxRate: ...

    async def get_details(self, symbol: str) -> TickerDetails: ...
