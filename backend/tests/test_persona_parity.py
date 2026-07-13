"""Persona parity gate (Phase 3).

The config-driven ``PersonaEngine`` must reproduce — bit-for-bit — the signals the
12 legacy hand-written persona agents produced, as frozen in
``fixtures/persona_golden.json`` during Phase 0. This test rehydrates the fixture
``AgentState`` and asserts the new engine's output equals the golden output for
every persona × every ticker (direction, confidence, and the exact reasoning
string). It is the contract that licenses deleting the old ``stratton`` persona
code.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.engine.models import CompanyDetails, FinancialMetrics, Price
from app.engine.personas import PersonaEngine

GOLDEN_PATH = Path(__file__).resolve().parent / "fixtures" / "persona_golden.json"
_PAYLOAD = json.loads(GOLDEN_PATH.read_text(encoding="utf-8"))


def _rehydrate(fixtures: dict) -> dict:
    """Fixtures JSON -> the same ``state["data"]`` shape the old agents consumed."""
    return {
        "tickers": fixtures["tickers"],
        "financials": {
            t: [FinancialMetrics(**m) for m in metrics]
            for t, metrics in fixtures["financials"].items()
        },
        "details": {t: CompanyDetails(**d) for t, d in fixtures["details"].items()},
        "prices": {
            t: [Price(**bar) for bar in bars]
            for t, bars in fixtures["prices"].items()
        },
    }


def _norm(sig: dict) -> dict:
    """Normalize exactly how the golden oracle was serialized (model_dump -> json)."""
    return json.loads(json.dumps(sig, default=str))


ENGINE = PersonaEngine()
DATA = _rehydrate(_PAYLOAD["fixtures"])
GOLDEN = _PAYLOAD["golden"]
ENGINE_OUT = ENGINE.evaluate_all(DATA)  # {agent_id: [signals]}


def test_all_personas_loaded():
    assert set(ENGINE.configs.keys()) == set(GOLDEN.keys())
    assert len(ENGINE.configs) == _PAYLOAD["meta"]["persona_count"] == 12


@pytest.mark.parametrize("persona_key", sorted(GOLDEN.keys()))
def test_persona_parity(persona_key: str):
    agent_id = ENGINE.configs[persona_key].agent_id
    got = [_norm(s) for s in ENGINE_OUT[agent_id]]
    expected = GOLDEN[persona_key]

    assert len(got) == len(expected), f"{persona_key}: signal count mismatch"
    for g, e in zip(got, expected):
        assert g == e, (
            f"\n[{persona_key}] parity mismatch for ticker {e['ticker']}:\n"
            f"  expected: {e}\n"
            f"  got:      {g}"
        )


def test_signal_totals():
    total = sum(len(v) for v in ENGINE_OUT.values())
    assert total == sum(len(v) for v in GOLDEN.values())
