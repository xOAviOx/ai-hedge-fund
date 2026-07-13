"""Telegram notifier (ported from services/notification_service.py).

Sends the fund memo to a Telegram chat when a bot token + chat id are configured
in settings. No-op (returns False) otherwise — notifications are never fatal.
"""
from __future__ import annotations

import logging

import httpx

from app.config import settings

logger = logging.getLogger(__name__)


def is_configured() -> bool:
    return bool(settings.telegram_bot_token and settings.telegram_chat_id)


async def send_message(text: str, *, timeout: float = 15.0) -> bool:
    """POST a message to the configured Telegram chat. Returns success."""
    if not is_configured():
        logger.info("Telegram not configured — skipping notification.")
        return False
    url = f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendMessage"
    payload = {"chat_id": settings.telegram_chat_id, "text": text, "parse_mode": "Markdown"}
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            resp = await client.post(url, json=payload)
            return resp.status_code == 200
    except Exception as e:  # noqa: BLE001 — best-effort
        logger.warning("Telegram send failed: %s", e)
        return False
