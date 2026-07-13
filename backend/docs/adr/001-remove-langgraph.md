# ADR-001: Remove LangGraph in favour of an asyncio pipeline

- **Status:** Accepted (Phase 3)
- **Date:** Phase 3 — Engine consolidation
- **Context files:** `app/engine/pipeline.py`, previously `stratton/src/graph/workflow.py`

## Context

The engine's agent orchestration was built on LangGraph. But the topology was
entirely **static**:

```
START ──┬── analyst_1 ─┐
        ├── analyst_2 ─┤
        ├── persona_1 ─┤   (parallel fan-out)
        └── …          ─┤
                        ├── risk_manager ── portfolio_manager ── END
```

A fixed fan-out → fan-in → risk → PM graph. There is no conditional routing, no
cycles, no dynamic edges, no tool-calling loop — none of the things LangGraph
exists to manage. What it *did* add:

- a hard dependency on `langgraph` **and** `langchain-core` (the `AgentState`
  reducer imported `langchain_core.messages.BaseMessage`) just to pass a dict
  between functions;
- import/cold-start weight on every process that touches the engine;
- a `merge_dicts` state reducer to accumulate `analyst_signals` that a plain
  `dict.update` expresses directly.

## Decision

Replace the graph with a hand-written `asyncio` orchestrator (`run_pipeline`):

```python
data     = await prefetch(universe)                       # through the cache
results  = await asyncio.gather(*analysts, persona_engine) # parallel fan-out
signals  = merge(results)                                  # explicit fan-in
risk     = risk_manager(state, signals)
orders   = portfolio_manager(state, risk)
memo     = await synthesis.write_memo(...)                 # one optional LLM call
```

Synchronous agents run via `asyncio.to_thread`; the explicit merge replaces the
graph reducer. `state.py` keeps a plain, dependency-free `AgentState` TypedDict.

## Consequences

- **`langgraph` is removed entirely**, and `langchain-core` is no longer required
  by the deterministic path. LangChain is now an *optional* dependency, pulled in
  lazily by `synthesis.py` only when a non-Groq LLM provider is used (the default
  Groq path uses the `groq` SDK directly).
- **Measured:** with data warm in shared state, the full agent phase (6 analysts +
  12 personas over 2 tickers) completes in ~**0.002 s** (`timings.agents_s` from a
  live `python -m app.engine.pipeline` run); prefetch dominates wall-clock and is
  now cache-backed. Importing `app.engine.pipeline` pulls **zero** langchain/
  langgraph modules (verified in Phase 3).
- The pipeline is easier to read, test (`test_engine_agents.py` runs it offline
  against a fake cache), and reason about than graph wiring.
- If future work needs genuine dynamic routing (e.g. agent-driven tool loops),
  this decision can be revisited — but that is not today's shape.
