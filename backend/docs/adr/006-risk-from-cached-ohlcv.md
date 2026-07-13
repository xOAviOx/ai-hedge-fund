# ADR-006: Risk analytics from cached OHLCV

- **Status:** Accepted (Phase 6)
- **Context files:** `app/risk/{metrics,service}.py`, `app/api/v1/risk.py`
  (replaces `app/services/portfolio_analysis.py`)

## Context

Phase 4 shipped risk that was computable from what the fund already stored:
NAV-based volatility/drawdown plus cost exposure. That is thin for a young fund
with few NAV snapshots. Phase 6 needs VaR, beta, correlation and monthly returns —
real numbers, not placeholders — for the Risk Desk.

## Decisions

1. **Compute from the holdings' cached daily OHLCV, not only NAV snapshots.** A new
   fund with three NAV points can't yield a meaningful volatility or beta, but its
   holdings have a year of prices in the cache. Risk is derived from those returns,
   so the desk is populated from day one. NAV-based vol/drawdown are kept alongside
   for continuity.

2. **Align on common trading dates; weight by market value.** Per-holding returns
   are aligned on the dates every holding shares, so the correlation matrix and the
   weighted portfolio-return series are internally consistent. Weights are current
   market value (last close × shares).

3. **Pure metric functions, offline-testable.** `metrics.py` has no pandas and no
   I/O: simple returns, annualized volatility, 1-day historical VaR (95%), Sharpe,
   beta, Pearson correlation, max drawdown, and calendar monthly returns. The
   service does the fetching/alignment; the math is unit tested on fixed inputs.

4. **Delete the placeholder.** `services/portfolio_analysis.py` (hard-coded
   "bias detection" and a demo diversification score) is removed — it was exactly
   the kind of mock the transformation exists to eliminate. ADR-004 had earmarked
   it as a risk source; that turned out not to be worth keeping.

5. **Degrade honestly.** With too little overlapping history, fields return `null`
   with an explanatory `note` — never a fabricated number. VaR is stated as 1-day
   historical at 95%; cost estimates are labelled estimates.

## Consequences

- `/api/v1/risk` returns annualized vol, VaR, Sharpe, beta vs benchmark, a
  correlation matrix, and a monthly-returns heatmap, plus the existing exposure.
- The Risk Desk renders a correlation heatmap (accent scale — correlation isn't
  P&L) and a green/red monthly-returns heatmap.
- Tests cover the metric math and a service assembly on the offline fake cache.
