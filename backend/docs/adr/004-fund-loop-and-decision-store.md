# ADR-004: Fund loop, decision store, and FX-aware ledger

- **Status:** Accepted (Phase 4)
- **Context files:** `app/fund/{ledger,nav,service,scheduler}.py`,
  `app/data/models.py`, `app/api/v1/*`, `app/main.py`

## Context

Phase 4 turns the deterministic engine into an autonomous paper fund: it must run
on a schedule, keep a real ledger, and make every decision auditable — while the
1,463-line monolith `main.py` is replaced by a thin factory over focused routers.

## Decisions

1. **Decision store = the persistence of a run, nothing extra.** `service.run_fund`
   writes a `runs` header plus one `signals` row per (agent, ticker) and the
   `orders` it applied, all linked by `run_id`. The Decision Room reads straight
   from these tables — no separate audit pipeline. `runs.memo` holds the (optional)
   AI memo.

2. **Ledger is SQLite-backed and FX-aware.** Positions store *native* `avg_cost`;
   NAV converts to the fund's base currency (INR) at the cached USDINR rate
   (`nav.py`). Buys are capped at affordable cash after FX conversion, so the
   ledger can never overspend — a safe degradation given the pipeline's
   INR-cash/native-price quantity sizing (refined later, not Phase 4).

3. **One fund per user, kill-switch in the run path.** `fund.is_paused` is checked
   at the top of `run_fund`, so pausing needs no scheduler surgery — the scheduled
   job still fires but returns early.

4. **Scheduler in the app lifespan.** An `AsyncIOScheduler` fires `run_fund("local")`
   on the fund's cron (default weekdays 15:45 IST, after NSE close). Startup is
   guarded against the uvicorn-reload double-fire and never blocks boot (tz falls
   back to local time if IANA data is missing; `tzdata` is a dependency to make IST
   reliable cross-platform).

5. **Honest partial surfaces.** `research` runs the real pipeline for one ticker;
   `risk` returns real NAV-derived volatility/drawdown + cost exposure; `backtest`
   returns a 501 (its point-in-time engine is Phase 6) rather than any mock — per
   the "no mock data, ever" rule.

## Consequences

- `main.py` is 49 lines; the monolith and its dead services/models were deleted
  (`portfolio_analysis.py` kept as the Phase-6 risk source).
- Tests: ledger/NAV math (incl. FX), a full offline `run_fund` integration, and
  httpx smoke tests for every router. `uvicorn app.main:app` boots with the
  scheduler live.
