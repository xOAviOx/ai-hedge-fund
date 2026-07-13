"""Fund service — orchestrates one full fund run.

    load fund -> (kill-switch check) -> run_pipeline -> apply orders to ledger
    -> persist run + signals + NAV snapshot -> Telegram memo

Everything the deterministic engine produces is persisted to the decision store
(``runs`` / ``signals`` / ``orders``), which powers the Decision Room with zero
extra work. The memo (and Telegram) are optional and never fatal.
"""
from __future__ import annotations

import logging
import uuid
from typing import Any, Optional

from sqlalchemy.ext.asyncio import async_sessionmaker

from app.data.cache import get_market_cache
from app.data.db import async_session_maker, init_db
from app.data.models import Run, SignalRow
from app.engine.pipeline import run_pipeline
from app.fund import ledger, nav
from app.notifications import telegram

logger = logging.getLogger(__name__)


async def _fetch_fx_usdinr(cache: Any) -> float:
    try:
        fx = await cache.get_fx("USDINR")
        return float(fx.rate) if fx and fx.rate else 1.0
    except Exception as e:  # noqa: BLE001
        logger.warning("USDINR fetch failed (%s); using 1.0 (NSE-only NAV unaffected).", e)
        return 1.0


async def run_fund(
    fund_id: str = "local",
    *,
    cache: Any = None,
    session_maker: Optional[async_sessionmaker] = None,
    notify: bool = True,
    write_memo: bool = True,
) -> dict:
    """Execute a full run for ``fund_id`` and persist it. Returns a summary dict."""
    if session_maker is None:
        session_maker = async_session_maker
        await init_db()
    cache = cache or get_market_cache()

    # 1) Load fund + current portfolio (kill-switch gate).
    async with session_maker() as session:
        fund = await ledger.get_or_create_fund(session, fund_id)
        if fund.is_paused:
            await session.commit()
            logger.info("Fund %s is paused — skipping run.", fund_id)
            return {"status": "paused", "fund_id": fund_id, "run_id": None}
        universe = list(fund.universe) or list(ledger.DEFAULT_UNIVERSE)
        personas = fund.active_personas or ["all"]
        positions = await ledger.get_positions(session, fund_id)
        portfolio = {
            "cash": fund.cash,
            "positions": {p.ticker: {"shares": int(p.shares)} for p in positions if p.shares > 0},
            "total_value": fund.cash,
        }
        await session.commit()

    # 2) Run the deterministic pipeline (outside any DB transaction).
    result = await run_pipeline(
        universe, personas=personas, portfolio=portfolio, cache=cache,
        write_memo=write_memo, resolve=True,
    )
    fx_usdinr = await _fetch_fx_usdinr(cache)

    # 3) Persist run + orders + signals + NAV snapshot (one transaction).
    run_id = uuid.uuid4().hex
    async with session_maker() as session:
        fund = await ledger.get_or_create_fund(session, fund_id)
        run = Run(
            id=run_id, fund_id=fund_id, universe=result.tickers,
            latency_ms=result.timings.get("total_s", 0.0) * 1000.0,
            llm_cost=0.0, memo=result.memo,
        )
        session.add(run)
        await session.flush()  # run.id must exist before orders reference it

        executed = await ledger.apply_orders(
            session, fund, result.orders, result.current_prices,
            fx_usdinr=fx_usdinr, run_id=run_id,
        )
        for agent_id, sigs in result.signals.items():
            for s in sigs:
                session.add(SignalRow(
                    run_id=run_id, agent=agent_id, ticker=s["ticker"],
                    direction=s["signal"], confidence=float(s["confidence"]),
                    factors=s["reasoning"],
                ))
        snap = await nav.snapshot_nav(session, fund, result.current_prices, fx_usdinr)
        summary_nav, summary_cash, summary_pv = snap.nav, snap.cash, snap.positions_value
        await session.commit()

    # 4) Notify (best-effort; never fatal).
    if notify and result.memo:
        await telegram.send_message(f"*Stratton Fund memo*\n\n{result.memo}")

    logger.info("Fund %s run %s complete: NAV=%.2f cash=%.2f", fund_id, run_id, summary_nav, summary_cash)
    return {
        "status": "ok",
        "fund_id": fund_id,
        "run_id": run_id,
        "universe": result.tickers,
        "orders": executed,
        "nav": summary_nav,
        "cash": summary_cash,
        "positions_value": summary_pv,
        "memo": result.memo,
        "timings": result.timings,
    }
