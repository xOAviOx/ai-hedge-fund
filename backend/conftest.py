"""Test bootstrap: make the backend root importable as `app.*`, and point the
global DB at a throwaway temp file so tests never touch the real portai.db.

DATABASE_URL must be set before app.data.db creates its engine at import time,
so this runs at conftest load (before any test module imports `app`)."""
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

if "DATABASE_URL" not in os.environ:
    _test_db = os.path.join(tempfile.gettempdir(), "portai_test.db")
    for _suffix in ("", "-wal", "-shm"):
        try:
            os.remove(_test_db + _suffix)
        except OSError:
            pass
    os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{_test_db}"
