"""PortAI — Stratton Fund API. App factory, middleware, routers, scheduler.

The 1,463-line monolith this replaces is gone: every surface now lives behind a
focused v1 router (app/api/v1/*), and the daily fund run is driven by the
APScheduler job wired into the lifespan below.
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.data.db import init_db
from app.fund.scheduler import shutdown_scheduler, start_scheduler

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("portai")


@asynccontextmanager
async def lifespan(_: FastAPI):
    await init_db()
    try:
        await start_scheduler("local")
    except Exception:  # noqa: BLE001 — never let the scheduler block boot
        logger.exception("Scheduler failed to start; continuing without it.")
    yield
    shutdown_scheduler()


app = FastAPI(title="PortAI — Stratton Fund", version="2.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")


@app.get("/")
async def root() -> dict:
    return {"name": "PortAI — Stratton Fund", "version": "2.0.0", "api": "/api/v1", "docs": "/docs"}
