"""SQLAlchemy ORM models for the data layer.

Phase 2 introduced the market-data cache table. Phase 4 adds the fund + decision
store described in TRANSFORM.md §4.1/§4.5: one ``funds`` row per user, plus
``positions`` / ``orders`` / ``nav_snapshots`` (the paper ledger) and
``runs`` / ``signals`` (the decision store powering the Decision Room).
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.data.db import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ── Market-data cache (Phase 2) ─────────────────────────────────────


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


# ── Fund (Phase 4) ──────────────────────────────────────────────────


class Fund(Base):
    """One paper fund per user (``id`` == user_id; dev fallback ``"local"``)."""

    __tablename__ = "funds"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    base_currency: Mapped[str] = mapped_column(String(8), default="INR")
    starting_cash: Mapped[float] = mapped_column(Float, default=1_000_000.0)
    cash: Mapped[float] = mapped_column(Float, default=1_000_000.0)
    universe: Mapped[list] = mapped_column(JSON, default=list)
    position_cap_pct: Mapped[float] = mapped_column(Float, default=30.0)
    active_personas: Mapped[list] = mapped_column(JSON, default=list)  # [] / ["all"] / keys
    schedule_cron: Mapped[str] = mapped_column(String(64), default="45 15 * * mon-fri")
    is_paused: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)


class PositionRow(Base):
    """A live holding in a fund's ledger."""

    __tablename__ = "positions"
    __table_args__ = (UniqueConstraint("fund_id", "ticker", name="uq_position_fund_ticker"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    fund_id: Mapped[str] = mapped_column(String(64), ForeignKey("funds.id"), index=True)
    ticker: Mapped[str] = mapped_column(String(32), index=True)
    shares: Mapped[float] = mapped_column(Float, default=0.0)
    avg_cost: Mapped[float] = mapped_column(Float, default=0.0)
    currency: Mapped[str] = mapped_column(String(8), default="INR")
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, onupdate=_utcnow)


class OrderRow(Base):
    """A filled (or held) order. Linked to the run that produced it, when any."""

    __tablename__ = "orders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    fund_id: Mapped[str] = mapped_column(String(64), ForeignKey("funds.id"), index=True)
    run_id: Mapped[str | None] = mapped_column(String(36), ForeignKey("runs.id"), nullable=True, index=True)
    ticker: Mapped[str] = mapped_column(String(32), index=True)
    action: Mapped[str] = mapped_column(String(8))  # buy / sell / hold
    quantity: Mapped[int] = mapped_column(Integer, default=0)
    price: Mapped[float] = mapped_column(Float, default=0.0)
    reasoning: Mapped[str] = mapped_column(Text, default="")
    ts: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)


class NavSnapshot(Base):
    """Point-in-time net asset value (in the fund's base currency)."""

    __tablename__ = "nav_snapshots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    fund_id: Mapped[str] = mapped_column(String(64), ForeignKey("funds.id"), index=True)
    ts: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, index=True)
    nav: Mapped[float] = mapped_column(Float)
    cash: Mapped[float] = mapped_column(Float)
    positions_value: Mapped[float] = mapped_column(Float)


class Run(Base):
    """One fund run — the header row of the decision store."""

    __tablename__ = "runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)  # uuid4 hex
    fund_id: Mapped[str] = mapped_column(String(64), ForeignKey("funds.id"), index=True)
    ts: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, index=True)
    universe: Mapped[list] = mapped_column(JSON, default=list)
    latency_ms: Mapped[float] = mapped_column(Float, default=0.0)
    llm_cost: Mapped[float] = mapped_column(Float, default=0.0)
    memo: Mapped[str | None] = mapped_column(Text, nullable=True)


class SignalRow(Base):
    """One agent's signal for one ticker within a run (the audit trail)."""

    __tablename__ = "signals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    run_id: Mapped[str] = mapped_column(String(36), ForeignKey("runs.id"), index=True)
    agent: Mapped[str] = mapped_column(String(48), index=True)
    ticker: Mapped[str] = mapped_column(String(32), index=True)
    direction: Mapped[str] = mapped_column(String(8))  # bullish / bearish / neutral
    confidence: Mapped[float] = mapped_column(Float, default=0.0)
    factors: Mapped[str] = mapped_column(Text, default="")  # the reasoning string
