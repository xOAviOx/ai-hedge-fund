"""Decisions router — the Decision Room audit trail (runs + per-agent signals)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db
from app.data.models import OrderRow, Run, SignalRow

router = APIRouter(prefix="/decisions", tags=["decisions"])


@router.get("")
async def list_runs(
    user: str = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
    limit: int = Query(50, ge=1, le=500),
) -> list[dict]:
    runs = (await session.execute(
        select(Run).where(Run.fund_id == user).order_by(desc(Run.ts)).limit(limit)
    )).scalars().all()
    out: list[dict] = []
    for r in runs:
        order_count = (await session.execute(
            select(func.count()).select_from(OrderRow).where(OrderRow.run_id == r.id)
        )).scalar_one()
        out.append({
            "run_id": r.id, "ts": r.ts.isoformat(), "universe": r.universe,
            "latency_ms": round(r.latency_ms, 1), "has_memo": bool(r.memo),
            "order_count": order_count,
        })
    return out


@router.get("/{run_id}")
async def run_detail(
    run_id: str,
    user: str = Depends(get_current_user),
    session: AsyncSession = Depends(get_db),
) -> dict:
    run = await session.get(Run, run_id)
    if run is None or run.fund_id != user:
        raise HTTPException(status_code=404, detail="run not found")

    signals = (await session.execute(
        select(SignalRow).where(SignalRow.run_id == run_id)
    )).scalars().all()
    orders = (await session.execute(
        select(OrderRow).where(OrderRow.run_id == run_id).order_by(OrderRow.ticker)
    )).scalars().all()

    by_ticker: dict[str, list[dict]] = {}
    for s in signals:
        by_ticker.setdefault(s.ticker, []).append({
            "agent": s.agent, "direction": s.direction,
            "confidence": s.confidence, "factors": s.factors,
        })

    return {
        "run_id": run.id,
        "ts": run.ts.isoformat(),
        "universe": run.universe,
        "latency_ms": round(run.latency_ms, 1),
        "llm_cost": run.llm_cost,
        "memo": run.memo,
        "signals_by_ticker": by_ticker,
        "orders": [
            {"ticker": o.ticker, "action": o.action, "quantity": o.quantity,
             "price": o.price, "reasoning": o.reasoning}
            for o in orders
        ],
    }
