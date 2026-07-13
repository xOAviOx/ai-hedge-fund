"""LLM factory (moved from ``stratton/src/llm.py``), rewired to ``app.config``.

This module is imported **lazily** (only by ``synthesis.py``, and only when an
LLM key is configured and the direct-SDK path isn't taken), so LangChain is an
*optional* dependency: the deterministic pipeline runs fully without it.
"""
from __future__ import annotations

import logging
from typing import Optional, TypeVar

from pydantic import BaseModel

from app.config import settings

logger = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)

_KEY_FOR = {
    "openai": "openai_api_key",
    "anthropic": "anthropic_api_key",
    "groq": "groq_api_key",
    "google": "google_api_key",
    "deepseek": "deepseek_api_key",
}


def _require_key(provider: str) -> Optional[str]:
    if provider == "ollama":
        return None
    attr = _KEY_FOR.get(provider)
    if attr is None:
        raise ValueError(
            f"Unknown LLM provider: '{provider}'. "
            f"Supported: {', '.join([*_KEY_FOR, 'ollama'])}"
        )
    key = getattr(settings, attr, None)
    if not key:
        raise ValueError(f"{attr.upper()} is required for provider '{provider}'.")
    return key


def get_chat_model(
    model_name: Optional[str] = None,
    model_provider: Optional[str] = None,
    temperature: float = 0.0,
):
    """Instantiate a LangChain chat model for the given provider (lazy imports)."""
    provider = (model_provider or settings.llm_provider).lower()
    model = model_name or settings.llm_model
    key = _require_key(provider)

    if provider == "openai":
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(model=model, api_key=key, temperature=temperature)
    if provider == "anthropic":
        from langchain_anthropic import ChatAnthropic
        return ChatAnthropic(model=model, api_key=key, temperature=temperature)
    if provider == "groq":
        from langchain_groq import ChatGroq
        return ChatGroq(model=model, api_key=key, temperature=temperature)
    if provider == "google":
        from langchain_google_genai import ChatGoogleGenerativeAI
        return ChatGoogleGenerativeAI(model=model, google_api_key=key, temperature=temperature)
    if provider == "deepseek":
        from langchain_openai import ChatOpenAI
        return ChatOpenAI(
            model=model, api_key=key, base_url="https://api.deepseek.com", temperature=temperature
        )
    if provider == "ollama":
        from langchain_ollama import ChatOllama
        return ChatOllama(model=model, temperature=temperature)
    raise ValueError(f"Unknown LLM provider: '{provider}'.")


def call_llm(
    prompt: str,
    response_model: type[T],
    model_name: Optional[str] = None,
    model_provider: Optional[str] = None,
    max_retries: int = 3,
    default_factory=None,
) -> T:
    """Call an LLM with structured Pydantic output + retry/fallback."""
    llm = get_chat_model(model_name, model_provider)
    structured = llm.with_structured_output(response_model)
    last: Optional[Exception] = None
    for attempt in range(1, max_retries + 1):
        try:
            return structured.invoke(prompt)
        except Exception as e:  # noqa: BLE001
            last = e
            logger.warning("LLM call attempt %d/%d failed: %s", attempt, max_retries, e)
    if default_factory is not None:
        return default_factory()
    raise last  # type: ignore[misc]
