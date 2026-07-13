"""Shared FastAPI dependencies: DB session, cache, current user."""
from __future__ import annotations

from typing import AsyncGenerator, Optional

from fastapi import Header
from sqlalchemy.ext.asyncio import AsyncSession

from app.data.cache import MarketCache, get_market_cache
from app.data.db import async_session_maker, init_db

DEV_USER = "local"


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Yield a short-lived async session (tables ensured on first use)."""
    await init_db()
    async with async_session_maker() as session:
        yield session


def get_cache() -> MarketCache:
    """The app-wide market cache (overridable in tests via dependency_overrides)."""
    return get_market_cache()


async def get_current_user(authorization: Optional[str] = Header(default=None)) -> str:
    """Resolve the caller to a fund id.

    Supabase JWT verification is optional (Phase 8). For now every caller maps to
    the dev fund ``"local"`` — one fund per user, single-user by default.
    """
    return DEV_USER
