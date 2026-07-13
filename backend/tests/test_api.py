"""API smoke tests for every v1 router (httpx AsyncClient, offline via FakeCache).

The global DB points at a temp file (see conftest). The market cache is
overridden with FakeCache so /fund/run and /research run without network.
"""
from __future__ import annotations

import asyncio

import httpx
from httpx import ASGITransport

from app.api.deps import get_cache
from app.main import app
from tests._fakes import FakeCache

app.dependency_overrides[get_cache] = lambda: FakeCache()


def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


def test_meta_health_and_stats():
    async def go():
        async with _client() as c:
            r = await c.get("/api/v1/meta/health")
            assert r.status_code == 200 and r.json()["status"] == "ok"
            r = await c.get("/api/v1/meta/stats")
            assert r.status_code == 200 and "cache" in r.json()

    asyncio.run(go())


def test_market_router():
    async def go():
        async with _client() as c:
            r = await c.get("/api/v1/market/quote/AAPL")
            assert r.status_code == 200 and r.json()["price"] == 159.0
            r = await c.get("/api/v1/market/ohlcv/RELIANCE")
            assert r.status_code == 200 and len(r.json()["bars"]) == 60
            r = await c.get("/api/v1/market/fx/USDINR")
            assert r.status_code == 200 and r.json()["rate"] == 83.0
            r = await c.get("/api/v1/market/search", params={"q": "RELIANCE"})
            assert r.status_code == 200 and r.json()["symbol"]

    asyncio.run(go())


def test_fund_run_and_decision_room():
    async def go():
        async with _client() as c:
            r = await c.put("/api/v1/fund/config", json={"universe": ["MOAT", "VALUE"], "active_personas": ["all"]})
            assert r.status_code == 200

            r = await c.post("/api/v1/fund/run")
            assert r.status_code == 200, r.text
            body = r.json()
            assert body["status"] == "ok"
            run_id = body["run_id"]

            r = await c.get("/api/v1/decisions")
            assert r.status_code == 200 and any(x["run_id"] == run_id for x in r.json())

            r = await c.get(f"/api/v1/decisions/{run_id}")
            assert r.status_code == 200
            detail = r.json()
            assert detail["signals_by_ticker"] and detail["orders"]

            r = await c.get("/api/v1/fund")
            assert r.status_code == 200 and r.json()["fund_id"] == "local"
            r = await c.get("/api/v1/fund/nav")
            assert r.status_code == 200 and len(r.json()) >= 1
            r = await c.get("/api/v1/risk")
            assert r.status_code == 200 and "max_drawdown_pct" in r.json()

    asyncio.run(go())


def test_research_and_backtest():
    async def go():
        async with _client() as c:
            r = await c.get("/api/v1/research/MOAT")
            assert r.status_code == 200 and r.json()["signals"]

            # Phase 6: a real point-in-time backtest, launched + polled to completion.
            r = await c.post("/api/v1/backtest/run", json={
                "universe": ["MOAT"], "start": "2025-01-05", "end": "2025-02-20", "step_days": 7,
            })
            assert r.status_code == 200
            bt_id = r.json()["backtest_id"]

            status = "running"
            for _ in range(100):
                await asyncio.sleep(0.05)
                r = await c.get(f"/api/v1/backtest/{bt_id}")
                assert r.status_code == 200
                status = r.json()["status"]
                if status != "running":
                    break
            body = r.json()
            assert status == "done", body.get("error")
            assert body["metrics"]["total_return_pct"] is not None
            assert body["equity_curve"] and body["disclosure"]

    asyncio.run(go())


def test_risk_router_shape():
    async def go():
        async with _client() as c:
            r = await c.get("/api/v1/risk")
            assert r.status_code == 200
            body = r.json()
            # Phase 6 fields present (values may be null with no positions).
            for key in ("var_95_pct", "beta", "correlation", "monthly_returns", "exposure"):
                assert key in body

    asyncio.run(go())


def test_kill_switch():
    async def go():
        async with _client() as c:
            r = await c.post("/api/v1/fund/pause")
            assert r.status_code == 200 and r.json()["is_paused"] is True
            r = await c.post("/api/v1/fund/run")
            assert r.status_code == 200 and r.json()["status"] == "paused"
            r = await c.post("/api/v1/fund/resume")
            assert r.status_code == 200 and r.json()["is_paused"] is False

    asyncio.run(go())
