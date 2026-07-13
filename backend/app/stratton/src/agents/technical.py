"""Technical analyst agent — momentum & trend analysis."""
from __future__ import annotations
import logging
from src.data.models import AnalystSignal, SignalType

logger = logging.getLogger(__name__)


def technical_agent(state: dict) -> dict:
    """Analyze price action and technical indicators."""
    data = state.get("data", {})
    tickers = data.get("tickers", [])
    signals = []

    for ticker in tickers:
        prices = data.get("prices", {}).get(ticker, [])

        signal = SignalType.NEUTRAL
        confidence = 50.0
        reasoning = "Insufficient price data for technical analysis."

        if len(prices) > 20:
            closes = [p.close for p in prices]
            current = closes[-1]

            # SMA calculations
            sma_20 = sum(closes[-20:]) / 20
            sma_50 = sum(closes[-50:]) / 50 if len(closes) >= 50 else sma_20

            # RSI (14-period)
            gains, losses = [], []
            for i in range(-14, 0):
                if i - 1 >= -len(closes):
                    change = closes[i] - closes[i - 1]
                    gains.append(max(change, 0))
                    losses.append(max(-change, 0))
            avg_gain = sum(gains) / len(gains) if gains else 0
            avg_loss = sum(losses) / len(losses) if losses else 0.001
            rs = avg_gain / avg_loss if avg_loss > 0 else 100
            rsi = 100 - (100 / (1 + rs))

            # Price momentum (20-day return)
            momentum = (current / closes[-20] - 1) * 100 if closes[-20] > 0 else 0

            # Volume trend
            volumes = [p.volume for p in prices]
            recent_vol = sum(volumes[-5:]) / 5 if len(volumes) >= 5 else 0
            avg_vol = sum(volumes[-20:]) / 20 if len(volumes) >= 20 else recent_vol

            factors = []
            bull_pts = 0
            bear_pts = 0

            # Trend
            if current > sma_20 > sma_50:
                bull_pts += 2
                factors.append(f"Uptrend: price ({current:.2f}) > SMA20 ({sma_20:.2f}) > SMA50 ({sma_50:.2f})")
            elif current < sma_20 < sma_50:
                bear_pts += 2
                factors.append(f"Downtrend: price below major MAs")
            else:
                factors.append(f"Mixed trend: price at {current:.2f}, SMA20={sma_20:.2f}")

            # RSI
            if rsi > 70:
                bear_pts += 1
                factors.append(f"RSI overbought ({rsi:.0f})")
            elif rsi < 30:
                bull_pts += 1
                factors.append(f"RSI oversold ({rsi:.0f})")
            else:
                factors.append(f"RSI neutral ({rsi:.0f})")

            # Momentum
            if momentum > 5:
                bull_pts += 1
                factors.append(f"Strong momentum ({momentum:+.1f}%)")
            elif momentum < -5:
                bear_pts += 1
                factors.append(f"Weak momentum ({momentum:+.1f}%)")

            # Volume
            if avg_vol > 0 and recent_vol > avg_vol * 1.5:
                factors.append("High volume surge")
                if bull_pts > bear_pts:
                    bull_pts += 1

            if bull_pts > bear_pts + 1:
                signal = SignalType.BULLISH
                confidence = min(90, 55 + bull_pts * 8)
            elif bear_pts > bull_pts + 1:
                signal = SignalType.BEARISH
                confidence = min(90, 55 + bear_pts * 8)
            else:
                signal = SignalType.NEUTRAL
                confidence = 50 + abs(bull_pts - bear_pts) * 5

            reasoning = "; ".join(factors[:3])

        signals.append(
            AnalystSignal(
                agent_id="technical_analyst",
                ticker=ticker,
                signal=signal,
                confidence=confidence,
                reasoning=reasoning,
            ).model_dump()
        )

    return {"data": {"analyst_signals": {"technical_analyst": signals}}}
