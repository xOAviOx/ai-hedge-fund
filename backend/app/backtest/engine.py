"""Point-in-time backtest orchestrator.

Prefetch the full window once, then step weekly: at each ``as_of`` build a
point-in-time ``state["data"]`` (prices sliced to <= as_of, financials filtered
to periods reported by as_of, news empty so sentiment stays neutral), run the
deterministic pipeline, and apply the PM's orders to the tracker. No LLM, no
lookahead.
"""
from __future__ import annotations

import asyncio
import logging
import re
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Any, Awaitable, Callable, Optional

from app.backtest.metrics import compute_metrics
from app.backtest.tracker import PortfolioTracker
from app.config import settings
from app.data.cache import get_market_cache
from app.data.providers.base import Financials
from app.data.symbols import resolve_symbol
from app.engine.analysts.macro_regime import SECTOR_ETFS
from app.engine.personas import get_persona_engine
from app.engine.pipeline import ANALYSTS
from app.engine.portfolio_manager import portfolio_manager_agent
from app.engine.prefetch import MARKET_SYMBOL, _to_details, _to_financials, _to_prices
from app.engine.risk_manager import risk_manager_agent

logger = logging.getLogger(__name__)

ProgressCb = Callable[[float], Awaitable[None]]

DISCLOSURE = (
    "Backtests are point-in-time on prices & fundamentals; "
    "news sentiment excluded to avoid lookahead bias."
)


@dataclass
class BacktestParams:
    universe: list[str]
    start: str  # YYYY-MM-DD (inclusive window start)
    end: str    # YYYY-MM-DD (inclusive window end)
    initial_cash: float = 1_000_000.0
    step_days: int = 7
    personas: Any = "all"
    benchmark: str = "^NSEI"

    def as_dict(self) -> dict:
        return {
            "universe": self.universe,
            "start": self.start,
            "end": self.end,
            "initial_cash": self.initial_cash,
            "step_days": self.step_days,
            "personas": self.personas,
            "benchmark": self.benchmark,
        }


# ── point-in-time helpers ───────────────────────────────────────────────

def _parse_date(s: Optional[str]) -> Optional[date]:
    if not s:
        return None
    try:
        return datetime.strptime(s[:10], "%Y-%m-%d").date()
    except ValueError:
        return None


def _parse_year(s: Optional[str]) -> Optional[int]:
    if not s:
        return None
    m = re.search(r"(19|20)\d{2}", s)
    return int(m.group(0)) if m else None


def _period_available(period: Any, as_of: date) -> bool:
    """Was this reporting period public by ``as_of``? (avoid lookahead)."""
    d = _parse_date(getattr(period, "filing_date", None))
    if d:
        return d <= as_of
    d = _parse_date(getattr(period, "period", None))
    if d:
        return d + timedelta(days=45) <= as_of  # ~reporting lag after period end
    y = _parse_year(getattr(period, "period", None))
    if y:
        return date(y + 1, 3, 31) <= as_of  # annual figures out by ~Q1 next year
    return True  # unknown format — include rather than crash


def _weekly_dates(start: date, end: date, step_days: int) -> list[date]:
    step = max(1, step_days)
    out: list[date] = []
    d = start
    while d <= end:
        out.append(d)
        d += timedelta(days=step)
    return out


def _last_le(by_date: dict[date, float], as_of: date) -> Optional[float]:
    best_d: Optional[date] = None
    for d in by_date:
        if d <= as_of and (best_d is None or d > best_d):
            best_d = d
    return by_date[best_d] if best_d is not None else None


# ── prefetch (once) ─────────────────────────────────────────────────────

@dataclass
class _Window:
    prices: dict[str, list] = field(default_factory=dict)   # sym -> [Price] (full window)
    financials: dict[str, Financials] = field(default_factory=dict)
    details: dict[str, Any] = field(default_factory=dict)
    bench: dict[date, float] = field(default_factory=dict)


async def _prefetch_window(cache: Any, tickers: list[str], price_start: str, end: str, benchmark: str) -> _Window:
    w = _Window()
    sem = asyncio.Semaphore(max(1, settings.provider_max_concurrency))
    market_syms = [MARKET_SYMBOL, *SECTOR_ETFS.keys()]

    async def _prices(sym: str) -> None:
        async with sem:
            try:
                ohlcv = await cache.get_ohlcv(sym, "1d", price_start, end)
                w.prices[sym] = _to_prices(ohlcv)
            except Exception as e:  # noqa: BLE001 — fail soft per symbol
                logger.warning("backtest prices failed for %s: %s", sym, e)
                w.prices[sym] = []

    async def _fundamentals(sym: str) -> None:
        async with sem:
            try:
                w.financials[sym] = await cache.get_financials(sym, quarters=12)
            except Exception as e:  # noqa: BLE001
                logger.warning("backtest financials failed for %s: %s", sym, e)
                w.financials[sym] = Financials(symbol=sym, periods=[])
        async with sem:
            try:
                td = await cache.get_details(sym)
                w.details[sym] = _to_details(sym, td)
            except Exception:  # noqa: BLE001
                w.details[sym] = None

    async def _benchmark() -> None:
        async with sem:
            try:
                ohlcv = await cache.get_ohlcv(benchmark, "1d", price_start, end)
                for b in ohlcv.bars:
                    if b.close:
                        w.bench[b.ts.date()] = b.close
            except Exception as e:  # noqa: BLE001
                logger.warning("backtest benchmark failed (%s): %s", benchmark, e)

    tasks: list[Any] = [_benchmark()]
    for s in tickers:
        tasks.append(_prices(s))
        tasks.append(_fundamentals(s))
    for s in market_syms:
        if s not in tickers:
            tasks.append(_prices(s))
    await asyncio.gather(*tasks)
    return w


def _point_in_time(tickers: list[str], w: _Window, as_of: date, tracker: PortfolioTracker) -> dict:
    prices = {
        sym: [p for p in plist if p.timestamp.date() <= as_of] for sym, plist in w.prices.items()
    }
    financials = {}
    for sym in tickers:
        raw = w.financials.get(sym)
        periods = [pp for pp in raw.periods if _period_available(pp, as_of)] if raw else []
        financials[sym] = _to_financials(sym, Financials(symbol=sym, periods=periods))
    return {
        "prices": prices,
        "financials": financials,
        "news": {sym: [] for sym in tickers},  # skipped — sentiment stays neutral
        "details": w.details,
        "tickers": tickers,
        "portfolio": tracker.get_portfolio_dict(),
    }


def _evaluate(data: dict, persona_list: Any) -> dict:
    """Deterministic pipeline (no async, no memo) over a point-in-time state."""
    state = {"data": data, "metadata": {}}
    signals: dict[str, list[dict]] = {}
    for fn in ANALYSTS.values():
        signals.update(fn(state)["data"]["analyst_signals"])
    signals.update(get_persona_engine().evaluate_all(data, persona_list))
    data["analyst_signals"] = signals
    risk_out = risk_manager_agent(state)["data"]
    data["risk_adjusted_signals"] = risk_out["risk_adjusted_signals"]
    data["current_prices"] = risk_out["current_prices"]
    pm_out = portfolio_manager_agent(state)["data"]["portfolio_output"]
    return {"pm": pm_out, "current_prices": data["current_prices"]}


# ── run ─────────────────────────────────────────────────────────────────

async def run_backtest(
    params: BacktestParams, *, cache: Any = None, progress_cb: Optional[ProgressCb] = None
) -> dict:
    cache = cache or get_market_cache()
    tickers = list(dict.fromkeys(resolve_symbol(t) for t in params.universe))
    start_d = date.fromisoformat(params.start)
    end_d = date.fromisoformat(params.end)
    price_start = (start_d - timedelta(days=250)).isoformat()  # warmup for indicators

    w = await _prefetch_window(cache, tickers, price_start, params.end, params.benchmark)
    dates = _weekly_dates(start_d, end_d, params.step_days)
    persona_list = None if params.personas in (None, "all", ["all"]) else params.personas

    tracker = PortfolioTracker(params.initial_cash)
    equity_curve: list[dict] = []
    bench_base: Optional[float] = None
    total = len(dates) or 1

    for i, as_of in enumerate(dates):
        data = _point_in_time(tickers, w, as_of, tracker)
        if not any(data["prices"].get(t) for t in tickers):
            if progress_cb:
                await progress_cb((i + 1) / total)
            continue

        step = await asyncio.to_thread(_evaluate, data, persona_list)
        tracker.check_stop_orders(step["current_prices"], as_of)
        tracker.apply_trades(step["pm"], step["current_prices"], as_of)
        tracker.update_high_water_marks(step["current_prices"])
        tracker.take_snapshot(as_of, step["current_prices"])

        bench_price = _last_le(w.bench, as_of)
        if bench_price and bench_base is None:
            bench_base = bench_price
        bench_val = (
            round(params.initial_cash * bench_price / bench_base, 2)
            if bench_price and bench_base
            else None
        )
        equity_curve.append({
            "date": as_of.isoformat(),
            "value": round(tracker.snapshots[-1].total_value, 2),
            "benchmark": bench_val,
        })
        if progress_cb:
            await progress_cb((i + 1) / total)

    metrics = compute_metrics(tracker.snapshots, tracker.trades, params.initial_cash)
    return {
        "params": params.as_dict(),
        "tickers": tickers,
        "metrics": metrics.model_dump(),
        "equity_curve": equity_curve,
        "trades": [
            {
                "date": t.date.isoformat(),
                "ticker": t.ticker,
                "action": t.action,
                "quantity": t.quantity,
                "price": round(t.price, 2),
                "trigger": t.trigger,
            }
            for t in tracker.trades
        ],
        "benchmark": params.benchmark,
        "disclosure": DISCLOSURE,
    }
