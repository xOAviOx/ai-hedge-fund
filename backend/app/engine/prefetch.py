"""Prefetch-into-shared-state, now reading through the Phase-2 cache.

Design (preserved from the original stratton engine): fetch *all* market data
up front into ``state["data"]`` so agents never call a provider themselves — they
read from memory. What changed in Phase 3:

  * data comes through ``app.data.cache.MarketCache`` (read-through TTL cache +
    singleflight) instead of ad-hoc yfinance/polygon calls, and
  * the cache's normalized models (``OHLCV`` / ``Financials`` / ``TickerDetails``
    / ``News``) are adapted to the engine's models (``Price`` /
    ``FinancialMetrics`` / ``CompanyDetails`` / ``CompanyNews``) that every ported
    agent already understands.

Fetches are bounded by ``settings.provider_max_concurrency`` and fail soft: a
missing symbol or a provider error yields empty data for that slot (logged), so
one bad ticker never sinks a whole run.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from app.config import settings
from app.data.cache import MarketCache, get_market_cache
from app.data.providers.base import (
    Financials,
    News,
    OHLCV,
    ProviderError,
    TickerDetails,
)
from app.engine.analysts.macro_regime import SECTOR_ETFS
from app.engine.models import CompanyDetails, CompanyNews, FinancialMetrics, Price

logger = logging.getLogger(__name__)

MARKET_SYMBOL = "SPY"  # benchmark + druckenmiller/macro reference


# ── model adapters (cache/provider models -> engine models) ─────────


def _to_prices(ohlcv: OHLCV) -> list[Price]:
    return [
        Price(
            open=b.open,
            high=b.high,
            low=b.low,
            close=b.close,
            volume=b.volume if b.volume is not None else 0.0,
            timestamp=b.ts,
        )
        for b in ohlcv.bars
    ]


def _to_financials(symbol: str, fin: Financials) -> list[FinancialMetrics]:
    # Engine agents assume financials[0] == most recent period.
    periods = sorted(
        fin.periods, key=lambda p: (p.filing_date or p.period or ""), reverse=True
    )
    out: list[FinancialMetrics] = []
    for p in periods:
        out.append(
            FinancialMetrics(
                ticker=symbol,
                period=p.period,
                fiscal_period=p.fiscal_period or p.period,
                revenue=p.revenue,
                net_income=p.net_income,
                earnings_per_share=p.earnings_per_share,
                total_assets=p.total_assets,
                total_liabilities=p.total_liabilities,
                shareholders_equity=p.shareholders_equity,
                operating_cash_flow=p.operating_cash_flow,
                free_cash_flow=p.free_cash_flow,
                gross_profit_margin=p.gross_profit_margin,
                net_profit_margin=p.net_profit_margin,
                return_on_equity=p.return_on_equity,
                debt_to_equity=p.debt_to_equity,
                current_ratio=p.current_ratio,
            )
        )
    return out


def _to_details(symbol: str, td: TickerDetails) -> CompanyDetails:
    return CompanyDetails(
        ticker=symbol,
        name=td.name or symbol,
        market_cap=td.market_cap,
        description=td.description,
        sic_description=td.industry or td.sector,
        total_employees=td.employees,
        share_class_shares_outstanding=td.shares_outstanding,
        weighted_shares_outstanding=td.shares_outstanding,
    )


def _to_news(symbol: str, news: News) -> list[CompanyNews]:
    out: list[CompanyNews] = []
    for it in news.items:
        out.append(
            CompanyNews(
                title=it.title,
                published_utc=it.published or datetime.now(timezone.utc),
                article_url=it.link or "",
                description=it.summary,
                tickers=[symbol],
            )
        )
    return out


# ── prefetch orchestration ──────────────────────────────────────────


async def prefetch(
    tickers: list[str],
    *,
    start: Optional[str] = None,
    end: Optional[str] = None,
    cache: Optional[MarketCache] = None,
    include_market: bool = True,
    lookback_days: int = 400,
) -> dict[str, Any]:
    """Load prices/financials/news/details for ``tickers`` (+ market refs).

    Returns the ``state["data"]`` sub-dict the agents read:
    ``{"prices": {sym: [Price]}, "financials": {sym: [FinancialMetrics]},
    "news": {sym: [CompanyNews]}, "details": {sym: CompanyDetails|None}}``.
    """
    cache = cache or get_market_cache()
    if end is None:
        end = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    if start is None:
        start = (datetime.now(timezone.utc) - timedelta(days=lookback_days)).strftime("%Y-%m-%d")

    result: dict[str, Any] = {"prices": {}, "financials": {}, "news": {}, "details": {}}

    price_only = [MARKET_SYMBOL, *SECTOR_ETFS.keys()] if include_market else []
    # dedupe while preserving order; a user ticker also in the market set stays full-fetch
    full_fetch = list(dict.fromkeys(tickers))
    price_only = [s for s in price_only if s not in set(full_fetch)]

    sem = asyncio.Semaphore(max(1, settings.provider_max_concurrency))

    async def _prices(sym: str) -> None:
        async with sem:
            try:
                ohlcv = await cache.get_ohlcv(sym, "1d", start, end)
                result["prices"][sym] = _to_prices(ohlcv)
            except (ProviderError, Exception) as e:  # fail soft
                logger.warning("prefetch prices failed for %s: %s", sym, e)
                result["prices"][sym] = []

    async def _fundamentals(sym: str) -> None:
        async with sem:
            try:
                fin = await cache.get_financials(sym, quarters=8)
                result["financials"][sym] = _to_financials(sym, fin)
            except Exception as e:
                logger.warning("prefetch financials failed for %s: %s", sym, e)
                result["financials"][sym] = []
        async with sem:
            try:
                news = await cache.get_news(sym, limit=20)
                result["news"][sym] = _to_news(sym, news)
            except Exception as e:
                logger.warning("prefetch news failed for %s: %s", sym, e)
                result["news"][sym] = []
        async with sem:
            try:
                td = await cache.get_details(sym)
                result["details"][sym] = _to_details(sym, td)
            except Exception as e:
                logger.warning("prefetch details failed for %s: %s", sym, e)
                result["details"][sym] = None

    tasks: list[Any] = []
    for sym in full_fetch:
        tasks.append(_prices(sym))
        tasks.append(_fundamentals(sym))
    for sym in price_only:
        tasks.append(_prices(sym))

    await asyncio.gather(*tasks)
    return result
