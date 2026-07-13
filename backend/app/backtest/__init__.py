"""Point-in-time backtesting engine.

Replays the deterministic agent pipeline weekly over a historical window with
point-in-time data (prices sliced to <= as_of, financials filtered to periods
reported by as_of, news skipped to avoid lookahead). Tracker/metrics/models are
ported faithfully from the stratton backtest module.
"""
