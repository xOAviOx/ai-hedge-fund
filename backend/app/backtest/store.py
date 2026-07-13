"""Backtest persistence + background execution.

A backtest is created as a ``backtests`` row (status ``running``), executed in a
fire-and-forget asyncio task that updates progress and finally writes the result
JSON (status ``done``) or an error (status ``error``). Polling is via
``GET /api/v1/backtest/{id}``.
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from typing import Any, Optional

from sqlalchemy.ext.asyncio import async_sessionmaker

from app.backtest.engine import BacktestParams, run_backtest
from app.data.db import async_session_maker, init_db
from app.data.models import BacktestRow

logger = logging.getLogger(__name__)


async def get_backtest(session, backtest_id: str) -> Optional[BacktestRow]:
    return await session.get(BacktestRow, backtest_id)


async def start_backtest(
    params: BacktestParams,
    fund_id: str,
    *,
    cache: Any = None,
    session_maker: Optional[async_sessionmaker] = None,
) -> str:
    """Create a backtest row and launch it in the background; return its id."""
    session_maker = session_maker or async_session_maker
    await init_db()
    bt_id = uuid.uuid4().hex
    async with session_maker() as s:
        s.add(BacktestRow(id=bt_id, fund_id=fund_id, status="running", progress=0.0, params=params.as_dict()))
        await s.commit()

    asyncio.create_task(_run(bt_id, params, cache, session_maker))
    return bt_id


async def run_and_wait(
    params: BacktestParams,
    fund_id: str,
    *,
    cache: Any = None,
    session_maker: Optional[async_sessionmaker] = None,
) -> str:
    """Run a backtest to completion inline (used by tests). Returns the id."""
    session_maker = session_maker or async_session_maker
    await init_db()
    bt_id = uuid.uuid4().hex
    async with session_maker() as s:
        s.add(BacktestRow(id=bt_id, fund_id=fund_id, status="running", progress=0.0, params=params.as_dict()))
        await s.commit()
    await _run(bt_id, params, cache, session_maker)
    return bt_id


async def _run(bt_id: str, params: BacktestParams, cache: Any, session_maker: async_sessionmaker) -> None:
    last = 0.0

    async def progress_cb(p: float) -> None:
        nonlocal last
        if p - last >= 0.05 or p >= 1.0:
            last = p
            async with session_maker() as s:
                row = await s.get(BacktestRow, bt_id)
                if row and row.status == "running":
                    row.progress = round(p, 3)
                    await s.commit()

    try:
        result = await run_backtest(params, cache=cache, progress_cb=progress_cb)
        async with session_maker() as s:
            row = await s.get(BacktestRow, bt_id)
            if row:
                row.status = "done"
                row.progress = 1.0
                row.result = result
                await s.commit()
    except Exception as e:  # noqa: BLE001 — record the failure, never crash the loop
        logger.exception("backtest %s failed", bt_id)
        async with session_maker() as s:
            row = await s.get(BacktestRow, bt_id)
            if row:
                row.status = "error"
                row.error = str(e)
                await s.commit()
