"""API v1 aggregator — mounts every v1 sub-router under one APIRouter."""
from __future__ import annotations

from fastapi import APIRouter

from app.api.v1 import backtest, decisions, fund, market, meta, research, risk

api_router = APIRouter()
for _module in (meta, market, fund, decisions, research, risk, backtest):
    api_router.include_router(_module.router)
