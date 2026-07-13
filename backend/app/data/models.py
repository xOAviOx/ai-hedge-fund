"""SQLAlchemy ORM models for the data layer.

Phase 2 introduces the market-data cache table. The fund / positions / orders /
nav_snapshots / runs / signals tables described in TRANSFORM.md §4.1 are added in
Phase 4 (the fund loop + decision store), where they are actually exercised.
"""
from __future__ import annotations

from sqlalchemy import Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.data.db import Base


class MarketCache(Base):
    """One cached provider response.

    ``key`` is a stable hash of (provider, method, params). ``value`` is the JSON
    of the normalized pydantic return model. Freshness = now - fetched_at < ttl.
    """

    __tablename__ = "market_cache"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    provider: Mapped[str] = mapped_column(String(64), index=True)
    method: Mapped[str] = mapped_column(String(32), index=True)
    params: Mapped[str] = mapped_column(Text)  # JSON, for debugging/inspection
    value: Mapped[str] = mapped_column(Text)  # JSON payload (model_dump_json)
    fetched_at: Mapped[float] = mapped_column(Float)  # epoch seconds
    ttl_seconds: Mapped[int] = mapped_column(Integer)
