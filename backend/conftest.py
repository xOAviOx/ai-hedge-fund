"""Ensure the backend package root is importable as `app.*` in tests,
regardless of the directory pytest is invoked from."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
