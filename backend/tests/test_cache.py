"""Tests for the data layer: read-through cache, TTL expiry, singleflight,
and the symbol resolver. All offline — a fake provider stands in for yfinance.

Async tests run their coroutine via asyncio.run(), so no pytest-asyncio needed.
"""
from __future__ import annotations

import asyncio
from collections import defaultdict
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.data.cache import IMMUTABLE_TTL, TTL_OHLCV_DAILY, TTL_OHLCV_INTRADAY, MarketCache
from app.data.db import Base
import app.data.models  # noqa: F401  (register MarketCache table on Base.metadata)
from app.data.providers.base import OHLCV, OHLCVBar, Quote
from app.data.symbols import normalize_fx_pair, resolve_benchmark, resolve_symbol


# ── fakes / helpers ──────────────────────────────────────────────────────

class FakeProvider:
    """Counts real calls per method; returns deterministic-ish data."""

    name = "fake"

    def __init__(self, delay: float = 0.0):
        self.calls: dict[str, int] = defaultdict(int)
        self._delay = delay

    async def get_quote(self, symbol: str) -> Quote:
        self.calls["get_quote"] += 1
        if self._delay:
            await asyncio.sleep(self._delay)
        # price encodes the call count so we can detect stale vs fresh fetches
        return Quote(symbol=symbol, price=100.0 + self.calls["get_quote"], ts=datetime.now(timezone.utc))

    async def get_ohlcv(self, symbol, interval="1d", start=None, end=None) -> OHLCV:
        self.calls["get_ohlcv"] += 1
        bar = OHLCVBar(ts=datetime.now(timezone.utc), open=1, high=2, low=0.5, close=1.5, volume=10)
        return OHLCV(symbol=symbol, interval=interval, bars=[bar])


class Clock:
    def __init__(self, t: float = 1_000_000.0):
        self.t = t

    def __call__(self) -> float:
        return self.t

    def advance(self, seconds: float) -> None:
        self.t += seconds


def _build_cache(tmp_path, provider, clock=None):
    db_file = tmp_path / "cache.db"
    engine = create_async_engine(
        f"sqlite+aiosqlite:///{db_file}", connect_args={"check_same_thread": False}
    )
    session_maker = async_sessionmaker(engine, expire_on_commit=False)

    _init_lock = asyncio.Lock()
    _state = {"done": False}

    async def init() -> None:  # concurrency-safe, mirrors app.data.db.init_db
        if _state["done"]:
            return
        async with _init_lock:
            if _state["done"]:
                return
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
            _state["done"] = True

    cache = MarketCache(provider, session_maker=session_maker, init=init, clock=(clock or (lambda: 0.0)))
    return cache, engine


# ── symbol resolver (pure) ───────────────────────────────────────────────

def test_symbol_resolver():
    assert resolve_symbol("RELIANCE") == "RELIANCE.NS"
    assert resolve_symbol("reliance") == "RELIANCE.NS"
    assert resolve_symbol("  tcs ") == "TCS.NS"
    assert resolve_symbol("RELIANCE.NS") == "RELIANCE.NS"
    assert resolve_symbol("TCS.BO") == "TCS.BO"
    assert resolve_symbol("SPY") == "SPY"          # US passthrough
    assert resolve_symbol("AAPL") == "AAPL"        # US passthrough
    assert resolve_symbol("^NSEI") == "^NSEI"      # index
    assert resolve_symbol("USDINR=X") == "USDINR=X"  # fx
    assert resolve_symbol("INFY", market="BSE") == "INFY.BO"
    assert resolve_symbol("INFY", market="US") == "INFY"

    assert resolve_benchmark("NIFTY50") == "^NSEI"
    assert resolve_benchmark("SPY") == "SPY"
    assert normalize_fx_pair("usdinr") == "USDINR=X"
    assert normalize_fx_pair("USDINR=X") == "USDINR=X"


# ── cache hit / miss ─────────────────────────────────────────────────────

def test_cache_hit_then_miss(tmp_path):
    async def run():
        provider = FakeProvider()
        cache, engine = _build_cache(tmp_path, provider, clock=Clock())
        try:
            q1 = await cache.get_quote("RELIANCE.NS")   # miss -> provider call
            q2 = await cache.get_quote("RELIANCE.NS")   # hit  -> no provider call
            assert provider.calls["get_quote"] == 1
            assert cache.stats.provider_calls == 1
            assert cache.stats.cache_hits == 1
            assert cache.stats.cache_misses == 1
            assert q1.price == q2.price  # served from cache, not re-fetched

            # different symbol -> different key -> another provider call
            await cache.get_quote("TCS.NS")
            assert provider.calls["get_quote"] == 2
            assert cache.stats.provider_calls == 2
        finally:
            await engine.dispose()

    asyncio.run(run())


# ── TTL expiry (frozen clock) ────────────────────────────────────────────

def test_ttl_expiry(tmp_path):
    async def run():
        provider = FakeProvider()
        clock = Clock()
        cache, engine = _build_cache(tmp_path, provider, clock=clock)
        try:
            await cache.get_quote("RELIANCE.NS")        # miss (call 1)
            clock.advance(30)                            # < 60s TTL
            await cache.get_quote("RELIANCE.NS")        # still fresh -> hit
            assert provider.calls["get_quote"] == 1

            clock.advance(61)                            # now > 60s since fetch
            q3 = await cache.get_quote("RELIANCE.NS")   # expired -> refetch
            assert provider.calls["get_quote"] == 2
            assert cache.stats.provider_calls == 2
            assert q3.price == 102.0                     # fresh value (2nd provider call)
        finally:
            await engine.dispose()

    asyncio.run(run())


# ── singleflight: N concurrent gets -> 1 provider call ───────────────────

def test_singleflight_concurrent(tmp_path):
    async def run():
        provider = FakeProvider(delay=0.05)  # hold the lock long enough to overlap
        cache, engine = _build_cache(tmp_path, provider, clock=Clock())
        try:
            results = await asyncio.gather(*[cache.get_quote("RELIANCE.NS") for _ in range(15)])
            assert provider.calls["get_quote"] == 1
            assert cache.stats.provider_calls == 1
            assert cache.stats.cache_misses == 1
            assert cache.stats.cache_hits == 14
            prices = {r.price for r in results}
            assert prices == {101.0}  # all 15 got the single fetched value
        finally:
            await engine.dispose()

    asyncio.run(run())


# ── OHLCV TTL policy (past daily window is immutable) ─────────────────────

def test_ohlcv_ttl_policy():
    assert MarketCache._ohlcv_ttl("1d", "2020-01-01") == IMMUTABLE_TTL
    assert MarketCache._ohlcv_ttl("1d", None) == TTL_OHLCV_DAILY
    assert MarketCache._ohlcv_ttl("5m", None) == TTL_OHLCV_INTRADAY
