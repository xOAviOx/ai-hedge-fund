# ADR-002: SQLite read-through cache for market data

- **Status:** Accepted (Phase 2; recorded here in Phase 3 as the engine now
  depends on it)
- **Context files:** `app/data/cache.py`, `app/data/models.py`,
  `app/data/providers/base.py`

## Context

The pre-refactor market-data path was a 33-line yfinance wrapper with **zero
caching** — every request hit yfinance live, and 6+ agents fanning out over a
universe multiplied that load, routinely tripping the unofficial API's limits.

## Decision

A read-through TTL cache (`MarketCache`) sits between the engine and any
`MarketDataProvider`. Each read hashes `(provider, method, params)` to a key,
checks the SQLite `market_cache` table, and only calls the provider on a miss —
then stores the normalized pydantic result. A per-key `asyncio.Lock`
(singleflight) guarantees N concurrent requests for the same key cause exactly
one provider call. TTLs: quote 60 s · intraday 5 min · **past daily OHLCV
immutable** · financials 24 h · news 15 min · fx 60 s · details 7 d. Counters
(hits/misses/provider_calls) are exposed for `/meta/stats`.

## Consequences (relevant to Phase 3)

- `prefetch.py` reads *through* this cache, so a warm run makes near-zero
  provider calls; a live 2-ticker run showed 17 provider calls cold, all cached
  thereafter.
- Providers return normalized models (`OHLCV`/`Financials`/`TickerDetails`/
  `News`); `prefetch.py` adapts those to the engine's models
  (`Price`/`FinancialMetrics`/`CompanyDetails`/`CompanyNews`) so agents are
  decoupled from the upstream source.
