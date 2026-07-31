"""Fixtures compartidas: mock de Codex para probar la orquestación sin CLI real."""
from __future__ import annotations

import sys
from pathlib import Path
from typing import Any

import pytest

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from tests.contracts import EXAMPLE_OUTPUTS


def _agent_for_schema(schema: dict | None) -> str | None:
    """Identifica el agente comparando las propiedades requeridas del schema
    recibido contra agents/contracts/*.schema.json, sin depender del texto
    del system prompt."""
    if not schema:
        return None
    required = set(schema.get("required", []))
    signatures = {
        "classifier": {"categoria", "urgencia_base"},
        "pattern": {"similares_encontrados", "posible_causa_estructural"},
        "acuse": {"mensaje"},
        "evidence": {"corresponde_a_descripcion", "severidad"},
        "dedup": {"duplicado_detectado", "reporte_id_original"},
        "escalation": {"debe_escalar", "director_area"},
    }
    for agent, sig in signatures.items():
        if sig <= required:
            return agent
    return None


@pytest.fixture
def mock_codex_exec(monkeypatch: pytest.MonkeyPatch):
    """Reemplaza starter.codex_exec / codex_exec_async por respuestas FIJAS
    (EXAMPLE_OUTPUTS), determinadas por el `schema` pasado a cada llamada —
    igual que agents/tests/mock_mcp_server.py hace para `buscar_similares`."""
    import starter

    calls: list[dict[str, Any]] = []

    def _fake_codex_exec(prompt: str, system: str | None = None, schema: dict | None = None, timeout: int = 120):
        agent = _agent_for_schema(schema)
        calls.append({"prompt": prompt, "system": system, "schema": schema, "agent": agent})
        if agent is None:
            raise RuntimeError("mock_codex_exec: no reconozco el schema recibido")
        return EXAMPLE_OUTPUTS[agent]

    async def _fake_codex_exec_async(*args, **kwargs):
        return _fake_codex_exec(*args, **kwargs)

    monkeypatch.setattr(starter, "codex_exec", _fake_codex_exec)
    monkeypatch.setattr(starter, "codex_exec_async", _fake_codex_exec_async)
    return calls
