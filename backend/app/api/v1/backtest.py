"""Backtest router — point-in-time backtest lands in Phase 6.

Mounted now so the API surface is complete, but it returns an honest 501 rather
than any placeholder/mock result (per the "no mock data, ever" rule). Phase 6
wires the real point-in-time engine (from the old stratton backtest module,
recoverable from git history) behind these routes.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/backtest", tags=["backtest"])

_NOT_YET = "Backtest engine is implemented in Phase 6 (point-in-time). Not available yet."


@router.post("/run")
async def start_backtest() -> dict:
    raise HTTPException(status_code=501, detail=_NOT_YET)


@router.get("/{backtest_id}")
async def get_backtest(backtest_id: str) -> dict:
    raise HTTPException(status_code=501, detail=_NOT_YET)
