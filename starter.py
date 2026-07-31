"""Shim de raíz: re-exporta assets/starter.py para el material de referencia."""
from assets.starter import *  # noqa: F401,F403
from assets.starter import CODEX_BIN, codex_exec, codex_exec_async, supervisor  # noqa: F401
