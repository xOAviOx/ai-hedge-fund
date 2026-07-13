"""PortAI engine — the Stratton Fund core (relocated & slimmed from stratton/).

Kept intentionally import-light: submodules (pipeline, personas, analysts,
synthesis) are imported on demand so that importing ``app.engine`` never pulls
optional heavy dependencies (e.g. LangChain, only needed when an LLM key is set).
"""
