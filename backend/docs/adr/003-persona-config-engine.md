# ADR-003: Config-driven PersonaEngine replaces 12 copy-paste persona agents

- **Status:** Accepted (Phase 3)
- **Date:** Phase 3 — Engine consolidation
- **Context files:** `app/engine/personas/{rules.py,engine.py,configs/*.yaml}`,
  `tests/test_persona_parity.py`, `tests/fixtures/persona_golden.json`

## Context

The 12 investor personas (`buffett`, `munger`, `graham`, `pabrai`, `lynch`,
`fisher`, `wood`, `damodaran`, `druckenmiller`, `burry`, `jhunjhunwala`,
`ackman`) were ~90% identical hand-written Python: each looped over tickers,
tallied bull/bear points against thresholds, and formatted factor strings. Only
the thresholds, point weights, and label text differed. Baseline: **402 LOC**
across 12 files (439 incl. `_persona_base.py`) with heavy duplication and no way
to add or tune a persona without touching code.

## Decision

One generic evaluator plus one YAML file per investor:

- **`rules.py`** — a small set of composable rule primitives, each mapping a
  single `if/elif` group from the old agents to a typed evaluator:
  `threshold`, `pe`, `ratio`, `growth`, `peg`, `momentum`, `momentum_regime`,
  `relative_strength`, `graham_number`, `conditions`, `keyword_match`. The metric
  **arithmetic and label formatting live in Python** (this is what makes exact
  parity achievable); only tunable numbers and label text live in config.
- **`configs/<persona>.yaml`** — display name, philosophy, and an ordered rule
  list. Rule/branch order is significant (`elif` = first satisfied branch wins;
  a branch with no `label` awards points silently, as some originals did). Outer
  guards (`if financials and prices:` …) are expressed per-rule via `needs`.
- **`engine.py`** — `PersonaEngine` loads the configs and emits the identical
  signal shape (`{agent_id, ticker, signal, confidence, reasoning}`); the
  direction/confidence mapping is a verbatim port of `create_persona_signal`.

## Parity is the contract

Before deleting the old agents, Phase 0 froze their outputs on four crafted
company profiles (MOAT / VALUE / DISTRESS / MEGA) into
`fixtures/persona_golden.json` (12 personas × 4 tickers = 48 signals).
`test_persona_parity.py` rehydrates those fixtures, runs the new engine, and
asserts **bit-for-bit equality** — direction, confidence, and the exact
`reasoning` string — for every persona. All 12 pass. Only then were the old
`stratton/src/agents/*.py` persona files deleted.

## Consequences

- Adding or tuning a persona is now a YAML edit, not a code change; a new
  primitive is needed only for genuinely new maths.
- The 6 analyst agents (technical, sentiment, fundamentals, valuation,
  macro_regime, growth) are **kept as code** — they compute real indicators and
  don't fit the threshold/label model. Genericizing them would add complexity
  for no gain.
- Risk: a config typo can silently change behaviour. Mitigation: the frozen
  golden parity test guards the 12 shipped personas; any new persona should ship
  with its own fixture row.
