"""Meta router — health + observability (cache/provider counters)."""
from __future__ import annotations

from fastapi import APIRouter

from app.data.cache import get_stats
from app.engine import llm_usage
from app.fund.scheduler import get_scheduler

router = APIRouter(prefix="/meta", tags=["meta"])


@router.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@router.get("/stats")
async def stats() -> dict:
    sched = get_scheduler()
    jobs = []
    if sched is not None:
        jobs = [
            {"id": j.id, "next_run_time": str(j.next_run_time) if j.next_run_time else None}
            for j in sched.get_jobs()
        ]
    llm = llm_usage.snapshot().as_dict()
    return {
        "cache": get_stats(),
        "llm": llm,
        "llm_cost": llm["cost_usd"],  # real cumulative estimate (was hard-coded 0.0)
        "scheduler": {"running": sched is not None, "jobs": jobs},
    }
