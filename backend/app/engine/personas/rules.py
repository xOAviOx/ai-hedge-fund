"""Rule primitives for the config-driven :class:`PersonaEngine`.

Each persona (``configs/buffett.yaml`` …) is an ordered list of *rules*. A rule
declares a ``type`` (one of the evaluators registered in :data:`RULE_TYPES`) plus
its thresholds, points and label templates. Evaluating a rule against a single
ticker yields **at most one** ``(bull_points, bear_points, factor)`` contribution
— exactly mirroring the single ``if/elif`` group each rule replaces in the old
hand-written persona files (``stratton/src/agents/<name>.py``).

The refactor contract is *bit-for-bit parity* with those agents
(``backend/tests/fixtures/persona_golden.json`` +
``backend/tests/test_persona_parity.py``). To guarantee it, the metric arithmetic
and the label formatting stay here in Python; only the tunable numbers and the
label text move to YAML. ``branch`` order is significant: the first branch whose
condition holds wins (``elif`` semantics). A branch with no ``label`` still adds
its points but appends no factor — faithfully reproducing branches like graham's
``elif pe > 30: bear += 1`` that award points silently.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Optional

from app.engine.models import (
    AnalystSignal,
    CompanyDetails,
    FinancialMetrics,
    Price,
    SignalType,
)

Contribution = tuple[int, int, Optional[str]]  # (bull, bear, factor)


# ── Per-(persona, ticker) evaluation context ────────────────────────


@dataclass
class RuleContext:
    """Everything a rule may read for one ticker, precomputed once."""

    ticker: str
    financials: list[FinancialMetrics]
    details: Optional[CompanyDetails]
    prices: list[Price]
    spy_prices: list[Price]

    @property
    def latest(self) -> Optional[FinancialMetrics]:
        return self.financials[0] if self.financials else None

    @property
    def prev(self) -> Optional[FinancialMetrics]:
        return self.financials[1] if len(self.financials) >= 2 else None

    @property
    def price(self) -> Optional[float]:
        return self.prices[-1].close if self.prices else None

    def spy_trend(self, window: int) -> float:
        """SPY return over ``window`` bars, or 0.0 when insufficient history.

        Mirrors druckenmiller's ``if len(spy_prices) > 30`` guard exactly.
        """
        if len(self.spy_prices) > window:
            return (self.spy_prices[-1].close / self.spy_prices[-window].close - 1) * 100
        return 0.0


# ── operators + branch evaluation ──────────────────────────────────


def _cmp(val: float, op: str, threshold: float) -> bool:
    if op == ">":
        return val > threshold
    if op == "<":
        return val < threshold
    if op == ">=":
        return val >= threshold
    if op == "<=":
        return val <= threshold
    raise ValueError(f"unknown operator: {op!r}")


def _eval_branches(branches: list[dict], metric: float, fmt: dict[str, Any]) -> Contribution:
    """Return the first satisfied branch's (bull, bear, formatted-label)."""
    for br in branches:
        if _cmp(metric, br["op"], br["value"]):
            label = br.get("label")
            factor = label.format(**fmt) if label else None
            return int(br.get("bull", 0)), int(br.get("bear", 0)), factor
    return 0, 0, None


# ── rule evaluators ────────────────────────────────────────────────
# Each: (ctx, params) -> Contribution. Truthy guards replicate the original
# `if latest.field and ...` checks (None *or* 0 skips the rule).


def _r_threshold(ctx: RuleContext, p: dict) -> Contribution:
    latest = ctx.latest
    if latest is None:
        return 0, 0, None
    v = getattr(latest, p["field"], None)
    if not v:
        return 0, 0, None
    return _eval_branches(p["branches"], v, {"v": v, "pct": v * 100})


def _r_pe(ctx: RuleContext, p: dict) -> Contribution:
    latest, price = ctx.latest, ctx.price
    if latest is None or price is None:
        return 0, 0, None
    eps = latest.earnings_per_share
    if not eps or eps <= 0:
        return 0, 0, None
    pe = price / eps
    return _eval_branches(p["branches"], pe, {"pe": pe, "price": price})


def _r_ratio(ctx: RuleContext, p: dict) -> Contribution:
    latest = ctx.latest
    if latest is None:
        return 0, 0, None
    num = getattr(latest, p["num"], None)
    if not num:
        return 0, 0, None
    if p.get("num_positive") and num <= 0:
        return 0, 0, None
    src = ctx.details if p.get("denom_source") == "details" else latest
    if src is None:
        return 0, 0, None
    denom = getattr(src, p["denom"], None)
    if not denom or denom <= 0:
        return 0, 0, None
    v = num / denom * p.get("scale", 1)
    return _eval_branches(p["branches"], v, {"v": v})


def _r_growth(ctx: RuleContext, p: dict) -> Contribution:
    latest, prev = ctx.latest, ctx.prev
    if latest is None or prev is None:
        return 0, 0, None
    lf = getattr(latest, p["field"], None)
    pf = getattr(prev, p["field"], None)
    if not lf or not pf or pf <= 0:
        return 0, 0, None
    g = (lf - pf) / abs(pf) * 100
    return _eval_branches(p["branches"], g, {"v": g})


def _r_peg(ctx: RuleContext, p: dict) -> Contribution:
    latest, prev, price = ctx.latest, ctx.prev, ctx.price
    if latest is None or prev is None or price is None:
        return 0, 0, None
    le, pe_prev = latest.earnings_per_share, prev.earnings_per_share
    if not le or le <= 0 or not pe_prev or pe_prev <= 0:
        return 0, 0, None
    pe = price / le
    eg = (le - pe_prev) / abs(pe_prev) * 100
    if eg <= 0:
        return 0, 0, None
    peg = pe / eg
    return _eval_branches(p["branches"], peg, {"peg": peg, "pe": pe, "eg": eg})


def _r_momentum(ctx: RuleContext, p: dict) -> Contribution:
    window = p["window"]
    if len(ctx.prices) <= window:
        return 0, 0, None
    ret = (ctx.prices[-1].close / ctx.prices[-window].close - 1) * 100
    return _eval_branches(p["branches"], ret, {"v": ret})


def _r_momentum_regime(ctx: RuleContext, p: dict) -> Contribution:
    """Momentum with an optional ``spy_bull`` gate on individual branches.

    Faithful to druckenmiller's ``if ret > 10 and spy_trend > 0`` first branch:
    a branch flagged ``spy_bull`` only fires when SPY's trend is positive; when
    it can't fire, evaluation falls through to the next branch (``elif``).
    """
    window = p["window"]
    if len(ctx.prices) <= window:
        return 0, 0, None
    ret = (ctx.prices[-1].close / ctx.prices[-window].close - 1) * 100
    spy_trend = ctx.spy_trend(window)
    for br in p["branches"]:
        if not _cmp(ret, br["op"], br["value"]):
            continue
        if br.get("spy_bull") and not (spy_trend > 0):
            continue
        label = br.get("label")
        factor = label.format(v=ret) if label else None
        return int(br.get("bull", 0)), int(br.get("bear", 0)), factor
    return 0, 0, None


def _r_relative_strength(ctx: RuleContext, p: dict) -> Contribution:
    window = p["window"]
    if len(ctx.prices) <= window:
        return 0, 0, None
    spy_trend = ctx.spy_trend(window)
    if spy_trend == 0:
        return 0, 0, None
    ret = (ctx.prices[-1].close / ctx.prices[-window].close - 1) * 100
    alpha = ret - spy_trend
    return _eval_branches(
        p["branches"], alpha, {"alpha": alpha, "abs_alpha": abs(alpha)}
    )


def _r_graham_number(ctx: RuleContext, p: dict) -> Contribution:
    latest, price, details = ctx.latest, ctx.price, ctx.details
    if latest is None or price is None:
        return 0, 0, None
    eps, se = latest.earnings_per_share, latest.shareholders_equity
    if not eps or not se or details is None:
        return 0, 0, None
    shares_out = details.share_class_shares_outstanding or details.weighted_shares_outstanding
    if not shares_out or shares_out <= 0:
        return 0, 0, None
    bvps = se / shares_out
    if eps <= 0 or bvps <= 0:
        return 0, 0, None
    graham_num = (22.5 * eps * bvps) ** 0.5
    fmt = {"graham_num": graham_num, "price": price}
    below, above = p["below"], p["above"]
    if price < graham_num * p.get("low_mult", 0.8):
        return int(below.get("bull", 0)), 0, (below["label"].format(**fmt) if below.get("label") else None)
    if price > graham_num * p.get("high_mult", 1.2):
        return 0, int(above.get("bear", 0)), (above["label"].format(**fmt) if above.get("label") else None)
    return 0, 0, None


def _r_conditions(ctx: RuleContext, p: dict) -> Contribution:
    """All listed field conditions must hold (each with a truthy guard)."""
    for c in p["conditions"]:
        src = ctx.details if c.get("source") == "details" else ctx.latest
        if src is None:
            return 0, 0, None
        v = getattr(src, c["field"], None)
        if not v or not _cmp(v, c["op"], c["value"]):
            return 0, 0, None
    return int(p.get("bull", 0)), int(p.get("bear", 0)), p.get("label")


def _r_keyword_match(ctx: RuleContext, p: dict) -> Contribution:
    details = ctx.details
    if details is None:
        return 0, 0, None
    text = getattr(details, p["field"], None)
    if not text:
        return 0, 0, None
    text = text.lower()
    hits = sum(1 for kw in p["keywords"] if kw in text)
    if hits >= p["min_hits"]:
        return int(p.get("bull", 0)), int(p.get("bear", 0)), p.get("label")
    return 0, 0, None


RULE_TYPES: dict[str, Callable[[RuleContext, dict], Contribution]] = {
    "threshold": _r_threshold,
    "pe": _r_pe,
    "ratio": _r_ratio,
    "growth": _r_growth,
    "peg": _r_peg,
    "momentum": _r_momentum,
    "momentum_regime": _r_momentum_regime,
    "relative_strength": _r_relative_strength,
    "graham_number": _r_graham_number,
    "conditions": _r_conditions,
    "keyword_match": _r_keyword_match,
}


# ── guards + dispatch ──────────────────────────────────────────────


def _needs_met(ctx: RuleContext, needs: Optional[dict]) -> bool:
    """Reproduce a persona's outer ``if`` guards (financials/prices/details)."""
    if not needs:
        return True
    min_fin = needs.get("financials")
    if min_fin is not None and len(ctx.financials) < min_fin:
        return False
    if needs.get("prices") and not ctx.prices:
        return False
    if needs.get("details") and ctx.details is None:
        return False
    return True


def evaluate_rule(ctx: RuleContext, rule: dict) -> Contribution:
    if not _needs_met(ctx, rule.get("needs")):
        return 0, 0, None
    try:
        fn = RULE_TYPES[rule["type"]]
    except KeyError:  # pragma: no cover - config author error
        raise ValueError(f"unknown rule type: {rule.get('type')!r}")
    return fn(ctx, rule)


# ── signal builder (port of _persona_base.create_persona_signal) ────


def build_signal(
    agent_id: str,
    ticker: str,
    bull_pts: int,
    bear_pts: int,
    factors: list[str],
    base_confidence: int = 55,
) -> dict:
    """Identical mapping to the legacy ``create_persona_signal`` helper."""
    if bull_pts > bear_pts + 1:
        signal = SignalType.BULLISH
        confidence = min(90, base_confidence + bull_pts * 8)
    elif bear_pts > bull_pts + 1:
        signal = SignalType.BEARISH
        confidence = min(90, base_confidence + bear_pts * 8)
    else:
        signal = SignalType.NEUTRAL
        confidence = 50 + abs(bull_pts - bear_pts) * 5

    reasoning = "; ".join(factors[:3]) if factors else f"{agent_id} analysis complete."

    return AnalystSignal(
        agent_id=agent_id,
        ticker=ticker,
        signal=signal,
        confidence=confidence,
        reasoning=reasoning,
    ).model_dump()
