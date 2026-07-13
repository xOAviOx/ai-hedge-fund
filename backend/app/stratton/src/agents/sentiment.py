"""Sentiment analyst agent — news & market flow analysis."""
from __future__ import annotations
import logging
from src.data.models import AnalystSignal, SignalType

logger = logging.getLogger(__name__)

POSITIVE_WORDS = {"upgrade", "beat", "surge", "growth", "profit", "record", "strong", "bullish", "outperform", "buy", "positive", "gain", "rally", "boost", "optimistic"}
NEGATIVE_WORDS = {"downgrade", "miss", "drop", "loss", "decline", "weak", "bearish", "underperform", "sell", "negative", "risk", "crash", "warning", "concern", "cut"}


def sentiment_agent(state: dict) -> dict:
    """Analyze news sentiment for each ticker."""
    data = state.get("data", {})
    tickers = data.get("tickers", [])
    signals = []

    for ticker in tickers:
        news_items = data.get("news", {}).get(ticker, [])
        details = data.get("details", {}).get(ticker)

        signal = SignalType.NEUTRAL
        confidence = 50.0
        reasoning = "No news data available for sentiment analysis."

        if news_items:
            pos_count = 0
            neg_count = 0
            total = len(news_items)

            for article in news_items:
                text = (article.title + " " + (article.description or "")).lower()
                pos_hits = sum(1 for w in POSITIVE_WORDS if w in text)
                neg_hits = sum(1 for w in NEGATIVE_WORDS if w in text)
                if pos_hits > neg_hits:
                    pos_count += 1
                elif neg_hits > pos_hits:
                    neg_count += 1

            if total > 0:
                pos_ratio = pos_count / total
                neg_ratio = neg_count / total

                if pos_ratio > 0.5 and pos_ratio > neg_ratio * 2:
                    signal = SignalType.BULLISH
                    confidence = min(85, 55 + int(pos_ratio * 30))
                    reasoning = f"{pos_count}/{total} articles positive. Strong bullish sentiment across news flow."
                elif neg_ratio > 0.5 and neg_ratio > pos_ratio * 2:
                    signal = SignalType.BEARISH
                    confidence = min(85, 55 + int(neg_ratio * 30))
                    reasoning = f"{neg_count}/{total} articles negative. Bearish sentiment dominates coverage."
                else:
                    signal = SignalType.NEUTRAL
                    confidence = 50
                    reasoning = f"Mixed sentiment: {pos_count} positive, {neg_count} negative out of {total} articles."
        elif details and details.description:
            reasoning = "Limited news; using company profile as baseline."

        signals.append(
            AnalystSignal(
                agent_id="sentiment_analyst",
                ticker=ticker,
                signal=signal,
                confidence=confidence,
                reasoning=reasoning,
            ).model_dump()
        )

    return {"data": {"analyst_signals": {"sentiment_analyst": signals}}}
