# LATER — deferred ideas

Per TRANSFORM.md global rule 2 ("no new feature pages — feature ideas go here,
not the code"), this is the parking lot. Nothing here ships without a deliberate
decision; the six surfaces stay six.

## Deferred during the transformation

- **SSE research streaming.** The Research Terminal uses the JSON
  `/api/v1/research/{ticker}` endpoint (the documented real data source). True
  token-streaming would add an SSE variant on the backend + an EventSource client
  hook. Nice-to-have; the JSON path is real and sufficient.
- **Per-run LLM cost on the decision store.** `/meta/stats` now reports real
  cumulative LLM cost (ADR: `feat(meta)`), but `runs.llm_cost` is still `0.0`.
  Wire the per-call cost delta from `llm_usage` into `RunResult` → `Run.llm_cost`
  so the Decision Room shows cost per run.
- **Live quote push.** Fund Console/Research poll on the quote cache TTL (60s).
  A WebSocket quote fan-out would make prices tick without polling.
- **Backtest depth.** Parameter sweeps, per-persona attribution, benchmark choice
  in the UI, and stop-loss/take-profit config (the tracker already supports stops;
  they're just not exposed).
- **Risk depth.** Factor exposures, rolling beta, and a live VaR backtest
  (Kupiec) once there is enough NAV history.

## Phase 8 (explicitly optional in the brief)

- Auth-gated multi-user funds (one fund per Supabase user, not the dev `local`).
- Upstox adapter (the removed OAuth callback was a stub; a real adapter + live
  paper/real order routing).
- Deploy configs for a Ubuntu server (systemd units alongside the compose).

## Product ideas raised but out of scope

- Alerts/notifications beyond the Telegram memo (price/threshold alerts).
- A screener surface (would be a 7th page — deliberately not built).
- Options/derivatives analytics.
