"""LLM usage/cost accounting: pricing math + /meta/stats surfacing."""
from __future__ import annotations

import asyncio

import httpx
from httpx import ASGITransport

from app.engine import llm_usage
from app.main import app


def test_estimate_cost_and_record():
    llm_usage.reset()
    # llama-3.3-70b: $0.59/M in, $0.79/M out.
    cost = llm_usage.estimate_cost("llama-3.3-70b-versatile", 1_000_000, 1_000_000)
    assert round(cost, 2) == round(0.59 + 0.79, 2)

    recorded = llm_usage.record("llama-3.3-70b-versatile", 500, 200)
    snap = llm_usage.snapshot()
    assert snap.calls == 1
    assert snap.prompt_tokens == 500 and snap.completion_tokens == 200
    assert snap.cost_usd == recorded > 0
    llm_usage.reset()
    assert llm_usage.snapshot().calls == 0


def test_meta_stats_reports_llm_cost():
    llm_usage.reset()
    llm_usage.record("llama-3.3-70b-versatile", 1000, 1000)

    async def go():
        transport = ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
            r = await c.get("/api/v1/meta/stats")
            assert r.status_code == 200
            body = r.json()
            assert body["llm"]["calls"] == 1
            assert body["llm_cost"] > 0
            assert body["llm_cost"] == body["llm"]["cost_usd"]

    asyncio.run(go())
    llm_usage.reset()
