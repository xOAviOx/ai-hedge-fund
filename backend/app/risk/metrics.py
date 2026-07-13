"""Pure risk-metric functions.

All inputs are plain Python sequences (no pandas) so every function is trivially
unit-testable offline. Returns are simple period-over-period returns; annualized
figures assume ~252 trading days. Percentages are returned as numbers where
``2.5`` means 2.5%.
"""
from __future__ import annotations

import math
from datetime import date
from typing import Optional, Sequence

TRADING_DAYS = 252


def simple_returns(closes: Sequence[float]) -> list[float]:
    """Period-over-period simple returns from a close series."""
    out: list[float] = []
    for i in range(1, len(closes)):
        prev = closes[i - 1]
        if prev and prev > 0:
            out.append(closes[i] / prev - 1.0)
    return out


def mean(xs: Sequence[float]) -> float:
    return sum(xs) / len(xs) if xs else 0.0


def stdev(xs: Sequence[float]) -> float:
    """Sample standard deviation (n-1)."""
    n = len(xs)
    if n < 2:
        return 0.0
    m = mean(xs)
    var = sum((x - m) ** 2 for x in xs) / (n - 1)
    return math.sqrt(var)


def annualized_volatility(returns: Sequence[float], periods_per_year: int = TRADING_DAYS) -> Optional[float]:
    """Annualized volatility as a percentage."""
    if len(returns) < 2:
        return None
    return stdev(returns) * math.sqrt(periods_per_year) * 100.0


def historical_var(returns: Sequence[float], level: float = 0.95) -> Optional[float]:
    """Historical Value-at-Risk as a positive percentage loss at ``level``.

    ``2.4`` means: on the worst (1-level) of days, the portfolio lost ≥ 2.4%.
    """
    if len(returns) < 2:
        return None
    ordered = sorted(returns)
    idx = int((1.0 - level) * len(ordered))
    idx = min(max(idx, 0), len(ordered) - 1)
    worst = ordered[idx]
    return round(-worst * 100.0, 3)


def sharpe_ratio(returns: Sequence[float], periods_per_year: int = TRADING_DAYS) -> Optional[float]:
    """Annualized Sharpe (risk-free = 0)."""
    if len(returns) < 2:
        return None
    sd = stdev(returns)
    if sd == 0:
        return None
    return (mean(returns) / sd) * math.sqrt(periods_per_year)


def covariance(a: Sequence[float], b: Sequence[float]) -> float:
    n = min(len(a), len(b))
    if n < 2:
        return 0.0
    ma, mb = mean(a[:n]), mean(b[:n])
    return sum((a[i] - ma) * (b[i] - mb) for i in range(n)) / (n - 1)


def beta(asset_returns: Sequence[float], market_returns: Sequence[float]) -> Optional[float]:
    """Beta of an asset/portfolio vs the market (aligned series)."""
    n = min(len(asset_returns), len(market_returns))
    if n < 2:
        return None
    mkt = market_returns[:n]
    var_m = covariance(mkt, mkt)
    if var_m == 0:
        return None
    return round(covariance(asset_returns[:n], mkt) / var_m, 3)


def correlation(a: Sequence[float], b: Sequence[float]) -> Optional[float]:
    n = min(len(a), len(b))
    if n < 2:
        return None
    sa, sb = stdev(a[:n]), stdev(b[:n])
    if sa == 0 or sb == 0:
        return None
    return round(covariance(a[:n], b[:n]) / (sa * sb), 3)


def max_drawdown(values: Sequence[float]) -> Optional[float]:
    """Max drawdown of a value series as a negative percentage."""
    if len(values) < 2:
        return None
    peak = values[0]
    dd = 0.0
    for v in values:
        if v > peak:
            peak = v
        if peak > 0:
            dd = min(dd, v / peak - 1.0)
    return round(dd * 100.0, 3)


def correlation_matrix(returns_by_key: dict[str, list[float]]) -> dict[str, dict[str, Optional[float]]]:
    """Pairwise Pearson correlation of already-aligned return series."""
    keys = list(returns_by_key)
    out: dict[str, dict[str, Optional[float]]] = {}
    for a in keys:
        out[a] = {}
        for b in keys:
            out[a][b] = 1.0 if a == b else correlation(returns_by_key[a], returns_by_key[b])
    return out


def monthly_returns(dated_returns: list[tuple[date, float]]) -> dict[str, float]:
    """Compound daily returns into calendar-month returns keyed ``YYYY-MM`` (percent)."""
    buckets: dict[str, float] = {}
    for d, r in dated_returns:
        key = f"{d.year:04d}-{d.month:02d}"
        buckets[key] = (1.0 + buckets.get(key, 0.0)) * (1.0 + r) - 1.0 if key in buckets else r
    return {k: round(v * 100.0, 2) for k, v in sorted(buckets.items())}
