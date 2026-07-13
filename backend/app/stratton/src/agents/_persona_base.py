"""Persona agent helpers — shared logic for investor persona agents.

All persona agents use the same core analysis structure but apply different
investment philosophy lens via prompt framing or hardcoded heuristics.
"""
from __future__ import annotations
from src.data.models import AnalystSignal, SignalType


def create_persona_signal(
    agent_id: str,
    ticker: str,
    bull_pts: int,
    bear_pts: int,
    factors: list[str],
    base_confidence: int = 55,
) -> dict:
    """Create a standardized analyst signal from bull/bear point counts."""
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
