"""Shim de raíz: re-exporta assets/starter.py para que `from starter import ...`
funcione sin duplicar el archivo de referencia del reto (ver CLAUDE.md)."""
from assets.starter import *  # noqa: F401,F403
from assets.starter import CLAUDE_BIN, claude_p, claude_p_async, supervisor  # noqa: F401
