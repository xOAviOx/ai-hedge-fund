"""PersonaEngine — one config-driven evaluator that replaces 12 persona files.

Loads ``configs/*.yaml`` (one investor per file) and evaluates each persona's
ordered rule list against the shared ``AgentState`` data, emitting the same
signal shape the old ``stratton/src/agents/<name>.py`` agents produced:
``{agent_id, ticker, signal, confidence, reasoning}``.

Parity with the old agents is enforced by ``test_persona_parity.py`` against the
frozen ``persona_golden.json`` oracle.
"""
from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any, Optional

import yaml

from app.engine.personas.rules import RuleContext, build_signal, evaluate_rule

CONFIG_DIR = Path(__file__).resolve().parent / "configs"


@dataclass(frozen=True)
class PersonaConfig:
    key: str
    agent_id: str
    display_name: str
    philosophy: str
    rules: list[dict]


def load_persona_configs(config_dir: Path = CONFIG_DIR) -> dict[str, PersonaConfig]:
    """Load every ``*.yaml`` in ``config_dir`` into a keyed registry."""
    configs: dict[str, PersonaConfig] = {}
    for path in sorted(config_dir.glob("*.yaml")):
        raw = yaml.safe_load(path.read_text(encoding="utf-8"))
        key = raw["name"]
        configs[key] = PersonaConfig(
            key=key,
            agent_id=raw["agent_id"],
            display_name=raw.get("display_name", key.title()),
            philosophy=raw.get("philosophy", ""),
            rules=raw.get("rules", []),
        )
    return configs


class PersonaEngine:
    """Evaluate persona configs against ``AgentState``-shaped data."""

    def __init__(self, configs: Optional[dict[str, PersonaConfig]] = None):
        self.configs = configs or load_persona_configs()

    # ── single persona ─────────────────────────────────────────────
    def evaluate_persona(self, key: str, data: dict[str, Any]) -> list[dict]:
        cfg = self.configs[key]
        tickers = data.get("tickers", [])
        financials = data.get("financials", {})
        details = data.get("details", {})
        prices = data.get("prices", {})
        spy_prices = prices.get("SPY", [])

        signals: list[dict] = []
        for ticker in tickers:
            ctx = RuleContext(
                ticker=ticker,
                financials=financials.get(ticker, []),
                details=details.get(ticker),
                prices=prices.get(ticker, []),
                spy_prices=spy_prices,
            )
            bull, bear, factors = 0, 0, []
            for rule in cfg.rules:
                b, be, factor = evaluate_rule(ctx, rule)
                bull += b
                bear += be
                if factor:
                    factors.append(factor)
            signals.append(build_signal(cfg.agent_id, ticker, bull, bear, factors))
        return signals

    # ── all requested personas ─────────────────────────────────────
    def evaluate_all(
        self, data: dict[str, Any], personas: Optional[list[str]] = None
    ) -> dict[str, list[dict]]:
        """Return ``{agent_id: [signals]}`` for the requested personas.

        ``personas`` selects by persona key (``["buffett", "munger"]``);
        ``None`` or ``["all"]`` runs every loaded persona.
        """
        if personas is None or personas == ["all"]:
            keys = list(self.configs.keys())
        else:
            keys = [k for k in personas if k in self.configs]

        out: dict[str, list[dict]] = {}
        for key in keys:
            cfg = self.configs[key]
            out[cfg.agent_id] = self.evaluate_persona(key, data)
        return out


@lru_cache
def get_persona_engine() -> PersonaEngine:
    """Process-wide singleton (configs parsed once)."""
    return PersonaEngine()
