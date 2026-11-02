"""Vercel runs this file for every /api/ address. All the logic is in server.py, one folder up."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from server import app  # noqa: E402,F401
