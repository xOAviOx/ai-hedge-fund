"""Market router — quotes, OHLCV, news, FX, and symbol search (all cache-backed)."""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.deps import get_cache
from app.data.cache import MarketCache
from app.data.providers.base import ProviderError, SymbolNotFound
from app.data.symbols import normalize_fx_pair, resolve_benchmark, resolve_symbol

router = APIRouter(prefix="/market", tags=["market"])


def _handle(exc: Exception) -> HTTPException:
    if isinstance(exc, SymbolNotFound):
        return HTTPException(status_code=404, detail=str(exc) or "symbol not found")
    if isinstance(exc, (ProviderError, ValueError)):
        return HTTPException(status_code=502, detail=f"provider error: {exc}")
    return HTTPException(status_code=500, detail="internal error")


@router.get("/quote/{symbol}")
async def quote(symbol: str, cache: MarketCache = Depends(get_cache)):
    try:
        return await cache.get_quote(resolve_symbol(symbol))
    except Exception as e:  # noqa: BLE001
        raise _handle(e)


@router.get("/ohlcv/{symbol}")
async def ohlcv(
    symbol: str,
    interval: str = Query("1d"),
    start: Optional[str] = Query(None),
    end: Optional[str] = Query(None),
    cache: MarketCache = Depends(get_cache),
):
    try:
        return await cache.get_ohlcv(resolve_symbol(symbol), interval, start, end)
    except Exception as e:  # noqa: BLE001
        raise _handle(e)


@router.get("/news/{symbol}")
async def news(symbol: str, limit: int = Query(20, ge=1, le=50), cache: MarketCache = Depends(get_cache)):
    try:
        return await cache.get_news(resolve_symbol(symbol), limit)
    except Exception as e:  # noqa: BLE001
        raise _handle(e)


@router.get("/fx/{pair}")
async def fx(pair: str, cache: MarketCache = Depends(get_cache)):
    try:
        return await cache.get_fx(normalize_fx_pair(pair))
    except Exception as e:  # noqa: BLE001
        raise _handle(e)


@router.get("/search")
async def search(q: str = Query(..., min_length=1), cache: MarketCache = Depends(get_cache)):
    """Resolve a user query to a symbol and return its details (best-effort)."""
    symbol = resolve_benchmark(q)
    out = {"query": q, "symbol": symbol, "details": None}
    try:
        out["details"] = await cache.get_details(symbol)
    except Exception:  # noqa: BLE001 — search must not 500 on a bad guess
        pass
    return out
