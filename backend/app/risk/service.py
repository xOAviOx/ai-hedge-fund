"""Assemble a live-portfolio risk report from cached OHLCV.

Weights are by current market value (last close × shares). Return series are
aligned on the common set of trading dates across all holdings (and the
benchmark) so correlation/beta/portfolio-return figures are consistent. Every
number is computed from real cached prices — never a placeholder.
"""
from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from app.fund import ledger, nav
from app.risk import metrics

logger = logging.getLogger(__name__)

DEFAULT_BENCHMARK = "^NSEI"
_LOOKBACK_DAYS = 365


def _iso_days_ago(days: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=days)).strftime("%Y-%m-%d")


async def _closes_by_date(cache: Any, symbol: str, start: str) -> dict[date, float]:
    ohlcv = await cache.get_ohlcv(symbol, "1d", start, None)
    return {b.ts.date(): b.close for b in ohlcv.bars if b.close and b.close > 0}


def _nav_based(navs: list[float]) -> tuple[Optional[float], Optional[float]]:
    if len(navs) < 2:
        return None, None
    rets = [navs[i] / navs[i - 1] - 1 for i in range(1, len(navs)) if navs[i - 1] > 0]
    vol = round(metrics.stdev(rets) * 100, 3) if len(rets) >= 2 else None
    return vol, metrics.max_drawdown(navs)


async def portfolio_risk(
    session: AsyncSession,
    cache: Any,
    fund_id: str,
    benchmark: str = DEFAULT_BENCHMARK,
) -> dict:
    positions = [p for p in await ledger.get_positions(session, fund_id) if p.shares > 0]
    snaps = await nav.nav_history(session, fund_id, limit=None)
    navs = [s.nav for s in snaps]
    nav_vol, nav_dd = _nav_based(navs)

    total_cost = sum(p.shares * p.avg_cost for p in positions) or 1.0
    exposure = [
        {
            "ticker": p.ticker,
            "cost_basis": round(p.shares * p.avg_cost, 2),
            "weight_pct": round(p.shares * p.avg_cost / total_cost * 100, 2),
        }
        for p in positions
    ]

    base: dict[str, Any] = {
        "nav_points": len(navs),
        "current_nav": navs[-1] if navs else None,
        "volatility_pct": nav_vol,
        "max_drawdown_pct": nav_dd,
        "exposure": exposure,
        "benchmark": benchmark,
        "annualized_vol_pct": None,
        "var_95_pct": None,
        "sharpe": None,
        "beta": None,
        "portfolio_drawdown_pct": None,
        "correlation": {"tickers": [], "matrix": []},
        "monthly_returns": {},
        "data_points": 0,
        "note": "",
    }

    if not positions:
        base["note"] = "No open positions — run the fund to build a book, then risk analytics populate."
        return base

    start = _iso_days_ago(_LOOKBACK_DAYS)
    closes: dict[str, dict[date, float]] = {}
    for p in positions:
        try:
            closes[p.ticker] = await _closes_by_date(cache, p.ticker, start)
        except Exception as e:  # noqa: BLE001 — one bad symbol never sinks the report
            logger.warning("risk OHLCV fetch failed for %s: %s", p.ticker, e)

    closes = {t: c for t, c in closes.items() if len(c) >= 3}
    if not closes:
        base["note"] = "Not enough price history to compute market-based risk yet."
        return base

    # Common trading dates across every holding.
    common: set[date] = set.intersection(*(set(c) for c in closes.values()))
    dates = sorted(common)
    if len(dates) < 3:
        base["note"] = "Holdings do not yet share enough overlapping history for correlation/VaR."
        return base

    # Aligned returns + market-value weights.
    returns_by_ticker: dict[str, list[float]] = {}
    weight_val: dict[str, float] = {}
    for p in positions:
        c = closes.get(p.ticker)
        if not c:
            continue
        series = [c[d] for d in dates]
        returns_by_ticker[p.ticker] = metrics.simple_returns(series)
        weight_val[p.ticker] = series[-1] * p.shares

    total_val = sum(weight_val.values()) or 1.0
    weights = {t: v / total_val for t, v in weight_val.items()}

    n_ret = min(len(r) for r in returns_by_ticker.values())
    port_returns = [
        sum(weights[t] * returns_by_ticker[t][i] for t in returns_by_ticker) for i in range(n_ret)
    ]

    # Benchmark returns aligned to the same dates.
    bench_returns: list[float] = []
    try:
        bc = await _closes_by_date(cache, benchmark, start)
        bser = [bc[d] for d in dates if d in bc]
        if len(bser) >= 3:
            bench_returns = metrics.simple_returns(bser)
    except Exception as e:  # noqa: BLE001
        logger.warning("risk benchmark fetch failed (%s): %s", benchmark, e)

    # Portfolio value series (indexed to 100) for drawdown.
    value_series = [100.0]
    for r in port_returns:
        value_series.append(value_series[-1] * (1 + r))

    dated = list(zip(dates[1 : 1 + n_ret], port_returns))
    tickers = list(returns_by_ticker)

    base.update(
        {
            "annualized_vol_pct": metrics.annualized_volatility(port_returns),
            "var_95_pct": metrics.historical_var(port_returns, 0.95),
            "sharpe": round(metrics.sharpe_ratio(port_returns), 3) if metrics.sharpe_ratio(port_returns) is not None else None,
            "beta": metrics.beta(port_returns, bench_returns) if bench_returns else None,
            "portfolio_drawdown_pct": metrics.max_drawdown(value_series),
            "correlation": {
                "tickers": tickers,
                "matrix": [[_cm(returns_by_ticker, a, b) for b in tickers] for a in tickers],
            },
            "monthly_returns": metrics.monthly_returns(dated),
            "data_points": n_ret,
            "note": "VaR is 1-day historical (95%); vol annualized; beta vs benchmark. All from cached daily OHLCV.",
        }
    )
    return base


def _cm(returns_by_ticker: dict[str, list[float]], a: str, b: str) -> Optional[float]:
    if a == b:
        return 1.0
    return metrics.correlation(returns_by_ticker[a], returns_by_ticker[b])
