"""Config-driven persona engine (replaces the 12 copy-paste persona agents)."""
from app.engine.personas.engine import (  # noqa: F401
    PersonaConfig,
    PersonaEngine,
    get_persona_engine,
    load_persona_configs,
)
