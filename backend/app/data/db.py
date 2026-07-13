"""Async SQLAlchemy engine/session (SQLite default, DATABASE_URL override).

Pitfall notes (per TRANSFORM.md §7):
- One engine, aiosqlite driver, WAL mode on, sensible busy_timeout.
- Don't share a session across tasks — callers open a short-lived session each.
"""
from __future__ import annotations

import asyncio
import os

from sqlalchemy import event
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from app.config import settings


class Base(DeclarativeBase):
    pass


def _ensure_sqlite_parent_dir(url: str) -> None:
    if not url.startswith("sqlite"):
        return
    database = make_url(url).database
    if database and database not in (":memory:", ""):
        parent = os.path.dirname(os.path.abspath(database))
        if parent:
            os.makedirs(parent, exist_ok=True)


def _create_engine(url: str) -> AsyncEngine:
    _ensure_sqlite_parent_dir(url)
    connect_args = {"check_same_thread": False} if url.startswith("sqlite") else {}
    engine = create_async_engine(url, echo=False, pool_pre_ping=True, connect_args=connect_args)

    if url.startswith("sqlite"):
        @event.listens_for(engine.sync_engine, "connect")
        def _set_sqlite_pragmas(dbapi_connection, _record):  # noqa: ANN001
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA journal_mode=WAL;")
            cursor.execute("PRAGMA busy_timeout=5000;")
            cursor.execute("PRAGMA foreign_keys=ON;")
            cursor.close()

    return engine


engine: AsyncEngine = _create_engine(settings.database_url)
async_session_maker: async_sessionmaker[AsyncSession] = async_sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)

_initialized = False
_init_lock = asyncio.Lock()


async def init_db() -> None:
    """Create tables if missing. Idempotent, cheap, and concurrency-safe.

    The lock + double-checked flag ensure that N concurrent first-callers (e.g.
    the singleflight burst on a cold cache) run ``create_all`` exactly once
    instead of racing each other into a "table already exists" error.
    """
    global _initialized
    if _initialized:
        return
    async with _init_lock:
        if _initialized:
            return
        # Import models so they register on Base.metadata before create_all.
        from app.data import models  # noqa: F401

        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        _initialized = True


async def reset_initialized() -> None:
    """Test hook: force init_db() to run again (e.g. after swapping engines)."""
    global _initialized
    _initialized = False
