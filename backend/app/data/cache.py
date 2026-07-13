"""Read-through TTL cache over a MarketDataProvider.

Every read checks the SQLite ``market_cache`` table first (key = hash of
provider+method+params). Miss -> provider -> store -> return. A per-key asyncio
lock (singleflight) guarantees that N concurrent requests for the same key cause
exactly ONE provider call. Counters (hits/misses/provider_calls) feed
``/api/v1/meta/stats`` in Phase 4.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import time
from dataclasses import dataclass
from datetime import date
from typing import Any, Awaitable, Callable, Optional, Type, TypeVar

from pydantic import BaseModel

from app.data.db import async_session_maker, init_db
from app.data.models import MarketCache as CacheRow
from app.data.providers.base import (
    Financials,
    FxRate,
    MarketDataProvider,
    News,
    OHLCV,
    Quote,
    TickerDetails,
)

T = TypeVar("T", bound=BaseModel)

# ── TTLs (seconds) ──────────────────────────────────────────────────────
TTL_QUOTE = 60
TTL_OHLCV_INTRADAY = 5 * 60
TTL_OHLCV_DAILY = 24 * 3600
TTL_FINANCIALS = 24 * 3600
TTL_NEWS = 15 * 60
TTL_FX = 60
TTL_DETAILS = 7 * 24 * 3600
IMMUTABLE_TTL = 10 * 365 * 24 * 3600  # daily OHLCV for a past window: never refetch


@dataclass
class CacheStats:
    cache_hits: int = 0
    cache_misses: int = 0
    provider_calls: int = 0
    errors: int = 0

    def as_dict(self) -> dict[str, Any]:
        total = self.cache_hits + self.cache_misses
        return {
            "cache_hits": self.cache_hits,
            "cache_misses": self.cache_misses,
            "provider_calls": self.provider_calls,
            "errors": self.errors,
            "hit_rate": round(self.cache_hits / total, 4) if total else 0.0,
        }

    def reset(self) -> None:
        self.cache_hits = self.cache_misses = self.provider_calls = self.errors = 0


class MarketCache:
    def __init__(
        self,
        provider: MarketDataProvider,
        *,
        session_maker=None,
        init: Optional[Callable[[], Awaitable[None]]] = None,
        clock: Callable[[], float] = time.time,
        stats: Optional[CacheStats] = None,
    ):
        self.provider = provider
        self._session_maker = session_maker or async_session_maker
        self._init = init or init_db
        self._clock = clock
        self.stats = stats or CacheStats()
        self._locks: dict[str, asyncio.Lock] = {}

    # ── key + freshness ────────────────────────────────────────────────
    def _key(self, method: str, params: dict[str, Any]) -> str:
        payload = json.dumps(
            {"p": self.provider.name, "m": method, "a": params}, sort_keys=True, default=str
        )
        return hashlib.sha256(payload.encode()).hexdigest()

    def _lock_for(self, key: str) -> asyncio.Lock:
        lock = self._locks.get(key)
        if lock is None:
            # setdefault is atomic under asyncio's single-threaded scheduler.
            lock = self._locks.setdefault(key, asyncio.Lock())
        return lock

    def _fresh(self, row: CacheRow) -> bool:
        return (self._clock() - row.fetched_at) < row.ttl_seconds

    # ── db helpers (short-lived session per op; never shared across tasks) ─
    async def _read_row(self, key: str) -> Optional[CacheRow]:
        async with self._session_maker() as session:
            return await session.get(CacheRow, key)

    async def _write_row(self, key, method, params, value_json, ttl) -> None:
        async with self._session_maker() as session:
            row = await session.get(CacheRow, key)
            now = self._clock()
            params_json = json.dumps(params, default=str)
            if row is None:
                session.add(
                    CacheRow(
                        key=key, provider=self.provider.name, method=method,
                        params=params_json, value=value_json, fetched_at=now, ttl_seconds=ttl,
                    )
                )
            else:
                row.method = method
                row.params = params_json
                row.value = value_json
                row.fetched_at = now
                row.ttl_seconds = ttl
            await session.commit()

    # ── the read-through core ──────────────────────────────────────────
    async def _through(
        self,
        method: str,
        params: dict[str, Any],
        fetch: Callable[[], Awaitable[T]],
        model: Type[T],
        ttl: int,
    ) -> T:
        await self._init()
        key = self._key(method, params)

        row = await self._read_row(key)
        if row is not None and self._fresh(row):
            self.stats.cache_hits += 1
            return model.model_validate_json(row.value)

        async with self._lock_for(key):
            # Double-check: another concurrent caller may have filled it.
            row = await self._read_row(key)
            if row is not None and self._fresh(row):
                self.stats.cache_hits += 1
                return model.model_validate_json(row.value)

            self.stats.cache_misses += 1
            self.stats.provider_calls += 1
            try:
                result = await fetch()
            except Exception:
                self.stats.errors += 1
                raise
            await self._write_row(key, method, params, result.model_dump_json(), ttl)
            return result

    # ── public API (mirrors the provider protocol) ─────────────────────
    async def get_quote(self, symbol: str) -> Quote:
        return await self._through(
            "get_quote", {"symbol": symbol},
            lambda: self.provider.get_quote(symbol), Quote, TTL_QUOTE,
        )

    async def get_ohlcv(
        self, symbol: str, interval: str = "1d", start: Optional[str] = None, end: Optional[str] = None
    ) -> OHLCV:
        params = {"symbol": symbol, "interval": interval, "start": start, "end": end}
        return await self._through(
            "get_ohlcv", params,
            lambda: self.provider.get_ohlcv(symbol, interval, start, end),
            OHLCV, self._ohlcv_ttl(interval, end),
        )

    async def get_financials(self, symbol: str, quarters: int = 8) -> Financials:
        return await self._through(
            "get_financials", {"symbol": symbol, "quarters": quarters},
            lambda: self.provider.get_financials(symbol, quarters), Financials, TTL_FINANCIALS,
        )

    async def get_news(self, symbol: str, limit: int = 20) -> News:
        return await self._through(
            "get_news", {"symbol": symbol, "limit": limit},
            lambda: self.provider.get_news(symbol, limit), News, TTL_NEWS,
        )

    async def get_fx(self, pair: str) -> FxRate:
        return await self._through(
            "get_fx", {"pair": pair},
            lambda: self.provider.get_fx(pair), FxRate, TTL_FX,
        )

    async def get_details(self, symbol: str) -> TickerDetails:
        return await self._through(
            "get_details", {"symbol": symbol},
            lambda: self.provider.get_details(symbol), TickerDetails, TTL_DETAILS,
        )

    @staticmethod
    def _ohlcv_ttl(interval: str, end: Optional[str]) -> int:
        if interval == "1d":
            if end:
                try:
                    if date.fromisoformat(end[:10]) < date.today():
                        return IMMUTABLE_TTL  # past daily window is immutable
                except ValueError:
                    pass
            return TTL_OHLCV_DAILY
        return TTL_OHLCV_INTRADAY


# ── app-wide default cache (yfinance-backed) ────────────────────────────
_default_cache: Optional[MarketCache] = None


def get_market_cache() -> MarketCache:
    global _default_cache
    if _default_cache is None:
        from app.data.providers.yfinance_provider import YFinanceAdapter

        _default_cache = MarketCache(YFinanceAdapter())
    return _default_cache


def get_stats() -> dict[str, Any]:
    return get_market_cache().stats.as_dict()
