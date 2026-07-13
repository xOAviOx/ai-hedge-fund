"""Symbol resolution for yfinance.

- NSE tickers need the ``.NS`` suffix (BSE = ``.BO``).
- Bare tickers default to NSE (``RELIANCE`` -> ``RELIANCE.NS``).
- A small set of US megacaps / ETFs pass through unchanged (``AAPL``, ``SPY``…).
- Indices (``^NSEI``) and FX pairs (``USDINR=X``) pass through unchanged.
"""
from __future__ import annotations

from typing import Optional

from app.config import settings

# US symbols that must NOT get an .NS suffix. Kept intentionally small — covers the
# fund's default US megacaps plus common benchmarks/ETFs. Extend as needed.
US_PASSTHROUGH: set[str] = {
    "SPY", "QQQ", "DIA", "IWM", "VOO", "VTI",
    "AAPL", "MSFT", "GOOGL", "GOOG", "AMZN", "NVDA", "META", "TSLA",
    "NFLX", "AMD", "INTC", "BRK-B", "JPM", "V", "MA", "WMT", "AVGO",
}

# Friendly benchmark names -> yfinance symbols.
BENCHMARKS: dict[str, str] = {
    "NIFTY": "^NSEI",
    "NIFTY50": "^NSEI",
    "NIFTY 50": "^NSEI",
    "SENSEX": "^BSESN",
    "BANKNIFTY": "^NSEBANK",
    "SPY": "SPY",
    "SP500": "SPY",
}

_MARKET_SUFFIX = {"NSE": ".NS", "BSE": ".BO"}


def resolve_symbol(raw: str, market: Optional[str] = None) -> str:
    """Normalize a user-typed symbol to a yfinance symbol.

    ``market`` (``"NSE"``/``"BSE"``/``"US"``) overrides the default market for bare
    tickers. Already-qualified symbols (suffixed, indices, FX) are returned as-is.
    """
    if raw is None:
        raise ValueError("symbol is required")
    s = raw.strip().upper()
    if not s:
        raise ValueError("symbol is required")

    # Indices and FX pairs are already fully qualified.
    if s.startswith("^") or s.endswith("=X"):
        return s

    # Already has an exchange suffix.
    if s.endswith(".NS") or s.endswith(".BO"):
        return s

    # Explicit US, or a known US passthrough symbol.
    if (market and market.upper() == "US") or s in US_PASSTHROUGH:
        return s

    suffix = _MARKET_SUFFIX.get((market or settings.default_market).upper(), ".NS")
    return f"{s}{suffix}"


def resolve_benchmark(name: str) -> str:
    """Resolve a friendly benchmark name (or a raw symbol) to a yfinance symbol."""
    key = (name or "").strip().upper()
    return BENCHMARKS.get(key, resolve_symbol(name))


def normalize_fx_pair(pair: str) -> str:
    """``USDINR`` / ``usdinr`` / ``USDINR=X`` -> ``USDINR=X``."""
    p = (pair or "").strip().upper().replace("/", "")
    if not p:
        raise ValueError("fx pair is required")
    return p if p.endswith("=X") else f"{p}=X"


def is_index(symbol: str) -> bool:
    return symbol.strip().startswith("^")
