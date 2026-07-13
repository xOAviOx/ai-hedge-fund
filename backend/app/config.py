"""Typed application settings — all env vars in one place (pydantic-settings).

Every environment variable the app reads is declared here with a type and a
default, so nothing else in the codebase reaches into ``os.environ`` directly.
"""
from __future__ import annotations

from functools import lru_cache
from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Database ────────────────────────────────────────────────────────
    # Async SQLAlchemy URL. SQLite by default; override with DATABASE_URL.
    database_url: str = "sqlite+aiosqlite:///./portai.db"

    # ── Market data provider ────────────────────────────────────────────
    # yfinance is unofficial — throttle concurrent calls and add small jitter.
    provider_max_concurrency: int = 5
    provider_jitter_seconds: float = 0.05
    default_market: str = "NSE"  # bare tickers resolve to .NS by default

    # ── LLM (used from Phase 3+). All optional — pipeline runs without a key.
    llm_provider: str = "groq"
    llm_model: str = "llama-3.3-70b-versatile"
    groq_api_key: Optional[str] = None
    openai_api_key: Optional[str] = None
    anthropic_api_key: Optional[str] = None
    google_api_key: Optional[str] = None
    deepseek_api_key: Optional[str] = None

    # ── Fund defaults (used from Phase 4+) ──────────────────────────────
    base_currency: str = "INR"

    # ── Notifications (used from Phase 4+) ──────────────────────────────
    telegram_bot_token: Optional[str] = None
    telegram_chat_id: Optional[str] = None

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")

    def has_any_llm_key(self) -> bool:
        return any(
            [
                self.groq_api_key,
                self.openai_api_key,
                self.anthropic_api_key,
                self.google_api_key,
                self.deepseek_api_key,
            ]
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
