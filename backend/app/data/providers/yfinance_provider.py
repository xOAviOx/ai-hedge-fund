"""yfinance-backed MarketDataProvider.

yfinance is synchronous and unofficial. We therefore:
- run every call in a worker thread via ``asyncio.to_thread``;
- throttle with a semaphore + small jitter (free-tier respect, §6.8);
- prefer ``fast_info`` for quotes and ``.history()`` for OHLCV (§7);
- raise ``SymbolNotFound`` on empty DataFrames so callers can return a clean 404.

Live fetches require network access to Yahoo Finance. The read-through cache and
the test-suite use a fake provider, so this adapter is not exercised offline.
"""
from __future__ import annotations

import asyncio
import random
from datetime import datetime, timezone
from typing import Any, Optional

import yfinance as yf

from app.config import settings
from app.data.providers.base import (
    Financials,
    FinancialsPeriod,
    FxRate,
    News,
    NewsItem,
    OHLCV,
    OHLCVBar,
    Quote,
    SymbolNotFound,
    TickerDetails,
)
from app.data.symbols import normalize_fx_pair


def _fast_get(fast_info: Any, *names: str) -> Optional[Any]:
    """Read a value from yfinance FastInfo, tolerating attr/mapping variants."""
    for n in names:
        try:
            val = getattr(fast_info, n)
            if val is not None:
                return val
        except Exception:
            pass
        try:
            val = fast_info[n]  # mapping access
            if val is not None:
                return val
        except Exception:
            pass
    return None


def _opt_float(v: Any) -> Optional[float]:
    try:
        if v is None:
            return None
        f = float(v)
        return None if f != f else f  # drop NaN
    except (TypeError, ValueError):
        return None


def _to_dt(idx: Any) -> datetime:
    try:
        dt = idx.to_pydatetime()
    except AttributeError:
        dt = idx if isinstance(idx, datetime) else datetime.now(timezone.utc)
    return dt


def _default_period(interval: str) -> str:
    if interval in ("1m",):
        return "5d"
    if interval in ("2m", "5m", "15m", "30m", "60m", "90m", "1h"):
        return "1mo"
    return "1y"


def _row(df: Any, col: Any, *labels: str) -> Optional[float]:
    """Value at (one of ``labels``, ``col``) in a yfinance statement DataFrame."""
    if df is None or getattr(df, "empty", True):
        return None
    for label in labels:
        try:
            if label in df.index:
                return _opt_float(df.loc[label, col])
        except Exception:
            continue
    return None


class YFinanceAdapter:
    name = "yfinance"

    def __init__(self, max_concurrency: Optional[int] = None, jitter: Optional[float] = None):
        self._sem = asyncio.Semaphore(max_concurrency or settings.provider_max_concurrency)
        self._jitter = settings.provider_jitter_seconds if jitter is None else jitter

    async def _run(self, fn, *args, **kwargs):
        async with self._sem:
            if self._jitter:
                await asyncio.sleep(random.uniform(0, self._jitter))
            return await asyncio.to_thread(fn, *args, **kwargs)

    # ── Quotes ──────────────────────────────────────────────────────────
    async def get_quote(self, symbol: str) -> Quote:
        def _fetch() -> Quote:
            t = yf.Ticker(symbol)
            fi = t.fast_info
            price = _opt_float(_fast_get(fi, "last_price", "lastPrice"))
            prev = _opt_float(_fast_get(fi, "previous_close", "previousClose"))
            currency = _fast_get(fi, "currency")
            if price is None:
                hist = t.history(period="5d")
                if hist is None or hist.empty:
                    raise SymbolNotFound(symbol)
                price = float(hist["Close"].iloc[-1])
                if prev is None and len(hist) >= 2:
                    prev = float(hist["Close"].iloc[-2])
            change = (price - prev) if prev is not None else None
            change_pct = (change / prev * 100) if (prev and change is not None) else None
            return Quote(
                symbol=symbol, price=price, currency=currency, previous_close=prev,
                change=change, change_pct=change_pct, ts=datetime.now(timezone.utc),
            )

        return await self._run(_fetch)

    # ── OHLCV ───────────────────────────────────────────────────────────
    async def get_ohlcv(
        self, symbol: str, interval: str = "1d", start: Optional[str] = None, end: Optional[str] = None
    ) -> OHLCV:
        def _fetch() -> OHLCV:
            t = yf.Ticker(symbol)
            kwargs: dict[str, Any] = {"interval": interval, "auto_adjust": False}
            if start or end:
                kwargs["start"] = start
                kwargs["end"] = end
            else:
                kwargs["period"] = _default_period(interval)
            hist = t.history(**kwargs)
            if hist is None or hist.empty:
                raise SymbolNotFound(symbol)
            bars = [
                OHLCVBar(
                    ts=_to_dt(idx),
                    open=float(row["Open"]), high=float(row["High"]),
                    low=float(row["Low"]), close=float(row["Close"]),
                    volume=_opt_float(row.get("Volume")),
                )
                for idx, row in hist.iterrows()
            ]
            return OHLCV(symbol=symbol, interval=interval, bars=bars)

        return await self._run(_fetch)

    # ── Financials ──────────────────────────────────────────────────────
    async def get_financials(self, symbol: str, quarters: int = 8) -> Financials:
        def _fetch() -> Financials:
            t = yf.Ticker(symbol)
            income = getattr(t, "quarterly_income_stmt", None)
            balance = getattr(t, "quarterly_balance_sheet", None)
            cash = getattr(t, "quarterly_cashflow", None)
            cols: list[Any] = []
            if income is not None and not getattr(income, "empty", True):
                cols = list(income.columns)[:quarters]
            periods: list[FinancialsPeriod] = []
            for col in cols:
                revenue = _row(income, col, "Total Revenue", "Operating Revenue")
                net_income = _row(income, col, "Net Income", "Net Income Common Stockholders")
                eps = _row(income, col, "Diluted EPS", "Basic EPS")
                equity = _row(balance, col, "Stockholders Equity", "Total Stockholder Equity", "Common Stock Equity")
                total_assets = _row(balance, col, "Total Assets")
                total_liab = _row(balance, col, "Total Liabilities Net Minority Interest", "Total Liab")
                cur_assets = _row(balance, col, "Current Assets", "Total Current Assets")
                cur_liab = _row(balance, col, "Current Liabilities", "Total Current Liabilities")
                total_debt = _row(balance, col, "Total Debt")
                ocf = _row(cash, col, "Operating Cash Flow", "Total Cash From Operating Activities")
                fcf = _row(cash, col, "Free Cash Flow")
                capex = _row(cash, col, "Capital Expenditure")
                if fcf is None and ocf is not None and capex is not None:
                    fcf = ocf + capex  # capex is negative in yfinance
                periods.append(
                    FinancialsPeriod(
                        period=str(getattr(col, "date", lambda: col)() if hasattr(col, "date") else col),
                        revenue=revenue, net_income=net_income, earnings_per_share=eps,
                        total_assets=total_assets, total_liabilities=total_liab,
                        shareholders_equity=equity, operating_cash_flow=ocf, free_cash_flow=fcf,
                        net_profit_margin=(net_income / revenue) if (net_income is not None and revenue) else None,
                        return_on_equity=(net_income / equity) if (net_income is not None and equity) else None,
                        debt_to_equity=((total_debt if total_debt is not None else total_liab) / equity)
                        if ((total_debt is not None or total_liab is not None) and equity) else None,
                        current_ratio=(cur_assets / cur_liab) if (cur_assets is not None and cur_liab) else None,
                    )
                )
            return Financials(symbol=symbol, periods=periods)

        return await self._run(_fetch)

    # ── News ────────────────────────────────────────────────────────────
    async def get_news(self, symbol: str, limit: int = 20) -> News:
        def _fetch() -> News:
            t = yf.Ticker(symbol)
            raw = getattr(t, "news", None) or []
            items: list[NewsItem] = []
            for n in raw[:limit]:
                if not isinstance(n, dict):
                    continue
                content = n.get("content")
                if isinstance(content, dict):  # newer yfinance schema
                    title = content.get("title")
                    publisher = (content.get("provider") or {}).get("displayName")
                    link = (content.get("canonicalUrl") or {}).get("url") or (content.get("clickThroughUrl") or {}).get("url")
                    published = content.get("pubDate")
                    summary = content.get("summary") or content.get("description")
                else:  # older schema
                    title = n.get("title")
                    publisher = n.get("publisher")
                    link = n.get("link")
                    published = n.get("providerPublishTime")
                    summary = n.get("summary")
                if not title:
                    continue
                items.append(
                    NewsItem(
                        title=title, publisher=publisher, link=link,
                        published=_parse_published(published), summary=summary,
                    )
                )
            return News(symbol=symbol, items=items)

        return await self._run(_fetch)

    # ── FX ──────────────────────────────────────────────────────────────
    async def get_fx(self, pair: str) -> FxRate:
        sym = normalize_fx_pair(pair)

        def _fetch() -> FxRate:
            t = yf.Ticker(sym)
            rate = _opt_float(_fast_get(t.fast_info, "last_price", "lastPrice"))
            if rate is None:
                hist = t.history(period="5d")
                if hist is None or hist.empty:
                    raise SymbolNotFound(sym)
                rate = float(hist["Close"].iloc[-1])
            return FxRate(pair=sym.replace("=X", ""), rate=float(rate), ts=datetime.now(timezone.utc))

        return await self._run(_fetch)

    # ── Details ─────────────────────────────────────────────────────────
    async def get_details(self, symbol: str) -> TickerDetails:
        def _fetch() -> TickerDetails:
            t = yf.Ticker(symbol)
            info: dict[str, Any] = {}
            for getter in ("get_info", "info"):
                try:
                    attr = getattr(t, getter)
                    info = (attr() if callable(attr) else attr) or {}
                    if info:
                        break
                except Exception:
                    continue
            if not info:
                raise SymbolNotFound(symbol)
            return TickerDetails(
                symbol=symbol,
                name=info.get("longName") or info.get("shortName"),
                sector=info.get("sector"),
                industry=info.get("industry"),
                market_cap=_opt_float(info.get("marketCap")),
                currency=info.get("currency"),
                exchange=info.get("exchange") or info.get("fullExchangeName"),
                employees=info.get("fullTimeEmployees"),
                description=info.get("longBusinessSummary"),
                shares_outstanding=_opt_float(info.get("sharesOutstanding")),
            )

        return await self._run(_fetch)


def _parse_published(value: Any) -> Optional[datetime]:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        try:
            return datetime.fromtimestamp(value, tz=timezone.utc)
        except (OverflowError, OSError, ValueError):
            return None
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    return None
