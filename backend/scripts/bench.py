"""Benchmark harness — cold vs warm analysis latency, provider calls, LLM cost.

Runs the real pipeline through the real read-through cache. Two modes:

  * offline (default): a deterministic synthetic provider sits behind the cache,
    so cache hit-rate, provider-call reduction and compute latency are measured
    for real (network excluded). A per-call delay simulates provider latency.
  * live (--live): uses the app's real cache (yfinance). Requires network.

Usage:
    cd backend
    python scripts/bench.py                 # offline, print a table
    python scripts/bench.py --write         # also write docs/BENCHMARKS.md
    python scripts/bench.py --live          # against live yfinance
"""
from __future__ import annotations

import argparse
import asyncio
import math
import os
import sys
import time
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.data.providers.base import (  # noqa: E402
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

DEFAULT_UNIVERSE = ["RELIANCE.NS", "TCS.NS", "HDFCBANK.NS", "INFY.NS", "AAPL", "MSFT"]


# ── synthetic provider (deterministic; behind the real cache) ────────────

class SyntheticProvider:
    """Deterministic MarketDataProvider for offline benchmarking."""

    name = "synthetic"

    def __init__(self, delay: float = 0.01):
        self.delay = delay  # simulated per-call provider latency (s)

    async def _tick(self) -> None:
        if self.delay:
            await asyncio.sleep(self.delay)

    @staticmethod
    def _seed(symbol: str) -> int:
        return sum(ord(c) for c in symbol)

    async def get_quote(self, symbol: str) -> Quote:
        await self._tick()
        base = 100 + self._seed(symbol) % 400
        return Quote(symbol=symbol, price=float(base), previous_close=float(base - 1),
                     change=1.0, change_pct=0.5, ts=datetime.now(timezone.utc))

    async def get_ohlcv(self, symbol: str, interval: str = "1d", start=None, end=None) -> OHLCV:
        await self._tick()
        n = 450
        seed = self._seed(symbol)
        anchor = datetime.now(timezone.utc) - timedelta(days=n)
        bars = []
        price = 100.0 + seed % 300
        for i in range(n):
            price *= 1 + 0.0004 * math.sin((i + seed) / 9.0) + 0.0002
            o = price
            c = price * (1 + 0.001 * math.cos((i + seed) / 5.0))
            hi = max(o, c) * 1.004
            lo = min(o, c) * 0.996
            bars.append(OHLCVBar(ts=anchor + timedelta(days=i), open=round(o, 3), high=round(hi, 3),
                                 low=round(lo, 3), close=round(c, 3), volume=1_000_000 + i))
        return OHLCV(symbol=symbol, interval=interval, bars=bars)

    async def get_financials(self, symbol: str, quarters: int = 8) -> Financials:
        await self._tick()
        seed = self._seed(symbol)
        periods = []
        for q in range(min(quarters, 8)):
            year = 2024 - q // 4
            periods.append(FinancialsPeriod(
                period=f"{year}-{(4 - q % 4) * 3:02d}-28",
                filing_date=f"{year}-{min(12, (4 - q % 4) * 3 + 1):02d}-15",
                revenue=5e10 + seed * 1e6, net_income=9e9 + seed * 1e5,
                earnings_per_share=5.0, return_on_equity=0.18 + (seed % 7) / 100,
                debt_to_equity=0.3 + (seed % 5) / 10, free_cash_flow=8e9,
                shareholders_equity=5e10, current_ratio=1.6, net_profit_margin=0.18,
            ))
        return Financials(symbol=symbol, periods=periods)

    async def get_news(self, symbol: str, limit: int = 20) -> News:
        await self._tick()
        return News(symbol=symbol, items=[
            NewsItem(title=f"{symbol} posts record profit on strong growth", summary="beat and upgrade"),
            NewsItem(title=f"Analysts optimistic on {symbol} outlook", summary="positive momentum"),
        ])

    async def get_fx(self, pair: str) -> FxRate:
        await self._tick()
        return FxRate(pair=pair, rate=83.0, ts=datetime.now(timezone.utc))

    async def get_details(self, symbol: str) -> TickerDetails:
        await self._tick()
        return TickerDetails(symbol=symbol, name=f"{symbol} Ltd", sector="Technology",
                             market_cap=2.2e11, employees=50_000, shares_outstanding=1.5e10,
                             currency="INR", exchange="NSE")


# ── cache builders ───────────────────────────────────────────────────────

async def _offline_cache(delay: float):
    """Isolated temp-file SQLite with production pragmas (WAL + busy_timeout).

    A file DB with a real connection pool is used (not in-memory StaticPool) so
    the ~30 concurrent cache writes during a cold run behave exactly as in
    production — otherwise a single shared connection races and drops writes,
    inflating the warm provider-call count.
    """
    import tempfile

    from sqlalchemy import event
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from app.data.cache import MarketCache
    from app.data.db import Base
    import app.data.models  # noqa: F401 — register tables

    path = os.path.join(tempfile.gettempdir(), f"portai_bench_{os.getpid()}.db")
    for suffix in ("", "-wal", "-shm"):
        try:
            os.remove(path + suffix)
        except OSError:
            pass

    engine = create_async_engine(
        f"sqlite+aiosqlite:///{path}", connect_args={"check_same_thread": False}, pool_pre_ping=True
    )

    @event.listens_for(engine.sync_engine, "connect")
    def _pragmas(dbapi_connection, _record):  # noqa: ANN001
        cur = dbapi_connection.cursor()
        cur.execute("PRAGMA journal_mode=WAL;")
        cur.execute("PRAGMA busy_timeout=5000;")
        cur.close()

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    sm = async_sessionmaker(engine, expire_on_commit=False)

    async def _init() -> None:
        return None

    cache = MarketCache(SyntheticProvider(delay=delay), session_maker=sm, init=_init)
    return cache, engine


# ── measurement ──────────────────────────────────────────────────────────

async def _run_once(universe, cache, write_memo):
    from app.engine.pipeline import run_pipeline

    t0 = time.perf_counter()
    await run_pipeline(universe, personas="all", cache=cache, write_memo=write_memo, resolve=True)
    return time.perf_counter() - t0


async def bench(universe, *, live: bool, delay: float, write_memo: bool) -> dict:
    from app.data.cache import get_market_cache
    from app.engine import llm_usage

    if live:
        cache = get_market_cache()
        engine = None
    else:
        cache, engine = await _offline_cache(delay)

    llm_usage.reset()
    cache.stats.reset()

    t_cold = await _run_once(universe, cache, write_memo)
    cold = cache.stats.as_dict()

    cache.stats.reset()
    t_warm = await _run_once(universe, cache, write_memo)
    warm = cache.stats.as_dict()

    llm = llm_usage.snapshot().as_dict()
    if engine is not None:
        await engine.dispose()

    return {
        "universe": universe,
        "mode": "live" if live else "offline",
        "provider_delay_ms": 0 if live else round(delay * 1000, 1),
        "cold_s": round(t_cold, 3),
        "warm_s": round(t_warm, 3),
        "speedup": round(t_cold / t_warm, 2) if t_warm else None,
        "provider_calls_cold": cold["provider_calls"],
        "provider_calls_warm": warm["provider_calls"],
        "hit_rate_warm": warm["hit_rate"],
        "llm_calls": llm["calls"],
        "llm_cost_usd": llm["cost_usd"],
    }


def _main_py_lines() -> int:
    path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "app", "main.py")
    try:
        with open(path, encoding="utf-8") as f:
            return sum(1 for _ in f)
    except OSError:
        return -1


def _render_md(r: dict) -> str:
    main_lines = _main_py_lines()
    lines = [
        "# PortAI — Benchmarks",
        "",
        f"Generated by `scripts/bench.py` ({r['mode']} mode) on "
        f"{datetime.now(timezone.utc).strftime('%Y-%m-%d')}.",
        "",
    ]
    if r["mode"] == "offline":
        lines += [
            "> Offline harness: a deterministic synthetic provider sits **behind the real "
            f"read-through cache**, with a simulated {r['provider_delay_ms']} ms per provider "
            "call. Cache hit-rate, provider-call reduction and compute latency are measured "
            "for real; network is excluded. Regenerate against live data with "
            "`python scripts/bench.py --live --write`.",
            "",
        ]
    lines += [
        f"Universe ({len(r['universe'])}): `{', '.join(r['universe'])}`",
        "",
        "| Metric | Cold (empty cache) | Warm (cache hot) |",
        "|---|---:|---:|",
        f"| Full-universe analysis latency | {r['cold_s']} s | {r['warm_s']} s |",
        f"| Provider calls per analysis | {r['provider_calls_cold']} | {r['provider_calls_warm']} |",
        f"| Cache hit-rate | — | {r['hit_rate_warm'] * 100:.1f}% |",
        "",
        f"- **Warm speedup:** {r['speedup']}×",
        f"- **Provider-call reduction:** {r['provider_calls_cold']} → {r['provider_calls_warm']} "
        "(daily OHLCV for past dates is immutable and never refetched; singleflight collapses "
        "concurrent misses to one call).",
        f"- **LLM calls / cost this run:** {r['llm_calls']} / ${r['llm_cost_usd']:.6f} "
        "(0 without an LLM key — the deterministic pipeline needs none; set `GROQ_API_KEY` "
        "and `--memo` to measure memo cost).",
        "",
        "## Deltas vs Phase-0 baseline (`docs/BASELINE.md`)",
        "",
        "| Metric | Baseline | Now |",
        "|---|---:|---:|",
        f"| `backend/app/main.py` | 1463 lines | {main_lines} lines |",
        "| Frontend pages | 57 | 6 surfaces (+ auth) |",
        "| LangGraph dependency | present | removed (ADR-001) |",
        "| Provider calls per warm analysis | every request hit yfinance | "
        f"{r['provider_calls_warm']} |",
        "",
    ]
    return "\n".join(lines)


def main() -> None:
    ap = argparse.ArgumentParser(description="PortAI benchmark harness.")
    ap.add_argument("--live", action="store_true", help="use the real yfinance cache (needs network)")
    ap.add_argument("--tickers", default=",".join(DEFAULT_UNIVERSE))
    ap.add_argument("--provider-delay", type=float, default=0.01, help="offline: simulated per-call latency (s)")
    ap.add_argument("--memo", action="store_true", help="run the LLM memo call (needs a key)")
    ap.add_argument("--write", action="store_true", help="write docs/BENCHMARKS.md")
    args = ap.parse_args()

    universe = [t.strip() for t in args.tickers.split(",") if t.strip()]
    result = asyncio.run(bench(universe, live=args.live, delay=args.provider_delay, write_memo=args.memo))

    print("=" * 60)
    print(f"PortAI benchmark — {result['mode']} mode")
    print("=" * 60)
    for k, v in result.items():
        if k != "universe":
            print(f"  {k:24} {v}")

    if args.write:
        out = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "docs", "BENCHMARKS.md")
        with open(out, "w", encoding="utf-8") as f:
            f.write(_render_md(result))
        print(f"\nWrote {out}")


if __name__ == "__main__":
    main()
