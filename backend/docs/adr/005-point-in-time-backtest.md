# ADR-005: Point-in-time backtest engine

- **Status:** Accepted (Phase 6)
- **Context files:** `app/backtest/{engine,tracker,metrics,models,store}.py`,
  `app/api/v1/backtest.py`, `app/data/models.py` (`BacktestRow`)

## Context

Phase 6 turns the deterministic pipeline into a backtester: replay the agents
over a historical window and report equity curve, metrics, and a trade log —
without lookahead, and fast enough to be usable. The stratton backtest module
(tracker/metrics/models) is good and gets reused; the point-in-time
orchestration is new.

## Decisions

1. **Prefetch once, slice per step.** The full price/financials/details window is
   fetched a single time; each weekly `as_of` builds its state by slicing the
   in-memory series (`prices ≤ as_of`), not by re-fetching. A ~52-step yearly
   backtest therefore makes one prefetch, not 52 — the cache and the immutable
   past-daily-OHLCV rule do the rest.

2. **Point-in-time is the contract, enforced three ways.** Prices are sliced to
   `≤ as_of`; financials are filtered by `filing_date` (falling back to
   period-end + a reporting lag, or annual-figures-out-by-Q1-next-year when a
   filing date is absent); news is skipped entirely so the sentiment agent returns
   neutral. This removes the three obvious lookahead channels. The rule is unit
   tested (`_period_available`).

3. **Reuse the pipeline, deterministically.** Each step runs the same analysts +
   persona engine + risk manager + portfolio manager as a live run, with **no LLM
   and no memo**, executed off the event loop via `asyncio.to_thread` so a long
   backtest never blocks other requests.

4. **Faithful tracker port.** `PortfolioTracker` (commission/slippage, optional
   stop orders, snapshots) and `compute_metrics` (return, Sharpe, max drawdown,
   win rate, profit factor) are ported unchanged from stratton — behaviour is the
   contract, not something to "improve" here.

5. **Background job + persistence, honest polling.** A run is a `backtests` row
   executed in a fire-and-forget task that records progress and writes the result
   JSON (or an error). `POST /backtest/run` returns an id; `GET /{id}` polls. This
   replaces the Phase-4 honest 501 stub — never a mock result.

## Consequences

- Equity-curve-vs-benchmark, metrics, and a trade log are real and reproducible;
  the lookahead-bias disclosure is surfaced from the engine into the UI.
- Absolute latency depends on network for live data, but the architecture keeps
  provider calls flat regardless of window length (prefetch-once).
- Tests: point-in-time availability, engine end-to-end, tracker buy/sell math,
  store persistence, and an API run-and-poll to completion — all offline.
