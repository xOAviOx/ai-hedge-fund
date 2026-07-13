"""Shared test helpers: an offline fake market cache + an isolated in-memory DB."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.data.providers.base import (
    Financials,
    FinancialsPeriod,
    FxRate,
    News,
    NewsItem,
    OHLCV,
    OHLCVBar,
    Quote,
    TickerDetails,
)

_ANCHOR = datetime(2025, 1, 1, tzinfo=timezone.utc)


class FakeCache:
    """Implements the MarketCache surface the engine/service/API call — offline."""

    name = "fake"

    def __init__(self, fx_usdinr: float = 83.0):
        self.fx_usdinr = fx_usdinr

    async def get_quote(self, symbol, *_a, **_k):
        return Quote(symbol=symbol, price=159.0, previous_close=158.0, change=1.0,
                     change_pct=0.63, ts=_ANCHOR)

    async def get_ohlcv(self, symbol, interval="1d", start=None, end=None):
        bars = [
            OHLCVBar(ts=_ANCHOR + timedelta(days=i), open=100 + i, high=100 + i,
                     low=100 + i, close=round(100 + i, 4), volume=1_000_000)
            for i in range(60)
        ]
        return OHLCV(symbol=symbol, interval=interval, bars=bars)

    async def get_financials(self, symbol, quarters=8):
        return Financials(symbol=symbol, periods=[
            FinancialsPeriod(period="2024", fiscal_period="FY2024", revenue=55e9, net_income=11e9,
                             earnings_per_share=6.0, return_on_equity=0.22, debt_to_equity=0.3,
                             free_cash_flow=9e9, shareholders_equity=50e9, current_ratio=1.8,
                             net_profit_margin=0.20),
            FinancialsPeriod(period="2023", fiscal_period="FY2023", revenue=48e9, net_income=9e9,
                             earnings_per_share=5.0, return_on_equity=0.20, debt_to_equity=0.32,
                             free_cash_flow=8e9, shareholders_equity=45e9, current_ratio=1.7,
                             net_profit_margin=0.187),
        ])

    async def get_news(self, symbol, limit=20):
        return News(symbol=symbol, items=[
            NewsItem(title="Company beats estimates on strong growth", summary="record profit and upgrade"),
        ])

    async def get_details(self, symbol):
        return TickerDetails(symbol=symbol, name=f"{symbol} Inc", market_cap=220e9, employees=60000,
                             shares_outstanding=15e9, description="AI cloud and robotics platform")

    async def get_fx(self, pair):
        return FxRate(pair=pair, rate=self.fx_usdinr, ts=_ANCHOR)


async def make_memory_db():
    """Return an (engine, session_maker) backed by a shared in-memory SQLite.

    StaticPool keeps one connection so multiple sessions see the same in-memory
    database (required because the fund service opens several short sessions).
    """
    engine = create_async_engine(
        "sqlite+aiosqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    from app.data.db import Base
    import app.data.models  # noqa: F401  — register all tables on Base.metadata

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    return engine, async_sessionmaker(engine, expire_on_commit=False)
