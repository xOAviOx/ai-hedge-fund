"""Demo: two get_quote("RELIANCE.NS") calls -> exactly ONE provider call.

    python backend/scripts/cache_demo.py           # offline (fake provider)
    python backend/scripts/cache_demo.py --live     # real yfinance (needs network)

Prints the cache stats so the single provider call is visible.
"""
from __future__ import annotations

import asyncio
import os
import sys
import tempfile
from collections import defaultdict
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.data.cache import MarketCache  # noqa: E402
from app.data.db import Base  # noqa: E402
import app.data.models  # noqa: E402,F401
from app.data.providers.base import Quote  # noqa: E402
from app.data.symbols import resolve_symbol  # noqa: E402
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine  # noqa: E402


class FakeProvider:
    name = "fake"

    def __init__(self):
        self.calls = defaultdict(int)

    async def get_quote(self, symbol: str) -> Quote:
        self.calls["get_quote"] += 1
        return Quote(symbol=symbol, price=1234.5, currency="INR", ts=datetime.now(timezone.utc))


async def main(live: bool) -> None:
    symbol = resolve_symbol("RELIANCE")  # -> RELIANCE.NS
    tmp = os.path.join(tempfile.gettempdir(), "portai_cache_demo.db")
    if os.path.exists(tmp):
        os.remove(tmp)
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp}", connect_args={"check_same_thread": False})
    sm = async_sessionmaker(engine, expire_on_commit=False)

    async def init():
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    if live:
        from app.data.providers.yfinance_provider import YFinanceAdapter

        provider = YFinanceAdapter()
    else:
        provider = FakeProvider()

    cache = MarketCache(provider, session_maker=sm, init=init)

    q1 = await cache.get_quote(symbol)
    q2 = await cache.get_quote(symbol)

    print(f"symbol            : {symbol}")
    print(f"quote #1 price    : {q1.price}")
    print(f"quote #2 price    : {q2.price}  (served from cache)")
    print(f"stats             : {cache.stats.as_dict()}")
    assert cache.stats.provider_calls == 1, "expected exactly one provider call"
    print("OK - 2 gets, 1 provider call.")
    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main(live="--live" in sys.argv))
