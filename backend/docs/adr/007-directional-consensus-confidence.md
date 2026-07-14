# ADR-007: Directional-conviction confidence in the risk manager

- **Status:** Accepted (Phase 8 — showcase hardening)
- **Context files:** `app/engine/risk_manager.py`, `tests/test_engine_agents.py`

## Context

The fund never traded. Not on a live run, and not across a full one-year
backtest (0 trades, equity flat at starting cash while the benchmark moved).
The portfolio manager buys only on a `bullish` consensus with confidence ≥ 50
(sells on `bearish` ≥ 60), and no ticker's aggregated confidence ever reached
that bar.

The cause was in the risk manager's aggregation, not the persona/analyst brains.
For a directional consensus it computed:

```
adj_conf = avg_conf * (bull / n)      # n = ALL agents, incl. neutral abstainers
```

With 18 agents (6 analysts + 12 personas) and many personas staying neutral on
any given name, `bull / n` was almost always small. Empirically, a clear
bullish consensus (5 bull vs 3 bear, avg_conf ≈ 62) yielded
`62 × 5/18 ≈ 17` — miles below 50. To clear the buy bar a name needed ~15 of 18
agents bullish, which effectively never happens. The threshold was unreachable
by construction, so the fund was inert.

## Decisions

1. **Scale directional confidence by the directional vote share, not the total
   agent count.** A `bullish` call's confidence reflects conviction *among agents
   that took a side* — neutral abstainers should not dilute it:

   ```
   directional = bull + bear
   adj_conf = avg_conf * (bull / directional)   # bearish: bear / directional
   ```

   The neutral branch (`avg_conf * 0.6`) and the consensus gates
   (`bull > bear + 1` / `bear > bull + 1`) are unchanged.

2. **Keep the buy/sell thresholds as-is (50 / 60).** This is a fix to a diluted
   metric, not a loosening of strategy. After the fix a name still only trades on
   a genuinely strong directional majority; on flat data it correctly holds.

3. **Contracts preserved.** `test_risk_manager_consensus_math` (3 bull @70 + 1
   bear @60 → confidence 50) is unchanged: that case has no neutral voters, so
   `n == bull + bear` and the result is identical. All 52 tests stay green.

## Consequences

- The engine trades again when conviction is real. A 1-year, point-in-time
  backtest (NRL.NS + RELIANCE.NS + INFY.NS + AAPL) now executes 34 agent-driven
  trades, +2.81% vs NIFTY 50 with a −12.23% max drawdown; longer windows show
  sells and losses too. The behaviour is emergent from real signals on real data,
  not seeded.
- Live runs still hold when the day's signals are genuinely weak (max directional
  confidence ~42 on the current universe) — an honest "no strong conviction"
  outcome, not a broken one.
- This does not touch persona rule logic or analyst math (the parity contract);
  it corrects only how their votes are combined into a confidence number.
