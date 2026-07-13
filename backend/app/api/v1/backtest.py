"""Backtest router — point-in-time backtests (Phase 6).

POST /run starts a background backtest and returns its id; GET /{id} polls status,
progress, and (when done) the metrics, equity curve, and trade log. Defaults are
drawn from the caller's fund when the request omits them.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_cache, get_current_user, get_db
from app.backtest.engine import BacktestParams
from app.backtest.store import get_backtest as _get_backtest
from app.backtest.store import start_backtest as _start_backtest
from app.data.cache import MarketCache
from app.fund import ledger

router = APIRouter(prefix="/backtest", tags=["backtest"])

_RESULT_KEYS = ("tickers", "metrics", "equity_curve", "trades", "benchmark", "disclosure")


class BacktestRequest(BaseModel):
    universe: Optional[list[str]] = None
    start: Optional[str] = None  # YYYY-MM-DD
    end: Optional[str] = None
    initial_cash: Optional[float] = None
    step_days: int = 7
    personas: Optional[list[str]] = None
    benchmark: str = "^NSEI"


@router.post("/run")
async def start_backtest(
    req: BacktestRequest,
    user: str = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
    cache: MarketCache = Depends(get_cache),
) -> dict:
    fund = await ledger.get_or_create_fund(session, user)
    await session.commit()

    today = datetime.now(timezone.utc).date()
    universe = req.universe or list(fund.universe) or list(ledger.DEFAULT_UNIVERSE)
    end = req.end or today.isoformat()
    start = req.start or (today - timedelta(days=365)).isoformat()
    initial_cash = req.initial_cash if req.initial_cash is not None else fund.starting_cash
    personas = req.personas or fund.active_personas or "all"
    if isinstance(personas, list) and not personas:
        personas = "all"

    params = BacktestParams(
        universe=universe,
        start=start,
        end=end,
        initial_cash=float(initial_cash),
        step_days=max(1, req.step_days),
        personas=personas,
        benchmark=req.benchmark,
    )
    bt_id = await _start_backtest(params, user, cache=cache)
    return {"backtest_id": bt_id, "status": "running", "params": params.as_dict()}


@router.get("/{backtest_id}")
async def get_backtest(
    backtest_id: str,
    user: str = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> dict:
    row = await _get_backtest(session, backtest_id)
    if row is None or row.fund_id != user:
        raise HTTPException(status_code=404, detail="backtest not found")

    out: dict = {
        "backtest_id": row.id,
        "status": row.status,
        "progress": row.progress,
        "params": row.params,
        "error": row.error,
        "created_at": row.created_at.isoformat(),
    }
    if row.result:
        for k in _RESULT_KEYS:
            out[k] = row.result.get(k)
    return out
