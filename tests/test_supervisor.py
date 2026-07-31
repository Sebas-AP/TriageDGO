"""Orquestación del Supervisor (arq.md §3.1): delegación en paralelo a los
subagentes + consolidación. FASE ROJA esperada — `starter.supervisor` y los
`subagente_*` siguen siendo stubs (`NotImplementedError`); estas pruebas
documentan el contrato que debe cumplir la implementación real (fase TDD
siguiente, ver CLAUDE.md)."""
from __future__ import annotations

import pytest

from starter import supervisor

REPORTE_EJEMPLO = {
    "texto": "Hay un bache enorme en la avenida principal, ya van dos autos dañados.",
    "coordenadas": [25.686, -100.316],
    "ciudadano_id": "ciu-001",
}


@pytest.mark.asyncio
async def test_supervisor_delega_en_paralelo_y_consolida_un_ticket(mock_codex_exec) -> None:
    resultado = await supervisor(REPORTE_EJEMPLO)

    assert "ticket_id" in resultado
    assert "urgencia_final" in resultado
    assert "prioridad_final" in resultado
    assert "acuse_enviado" in resultado


@pytest.mark.asyncio
async def test_supervisor_usa_codex_para_cada_subagente(mock_codex_exec) -> None:
    await supervisor(REPORTE_EJEMPLO)

    assert len(mock_codex_exec) >= 3
    agentes_llamados = {c["agent"] for c in mock_codex_exec}
    assert {"classifier", "pattern", "acuse"} <= agentes_llamados


@pytest.mark.asyncio
async def test_supervisor_marca_revision_manual_si_un_subagente_falla(mock_codex_exec, monkeypatch) -> None:
    import starter

    async def _falla(*_args, **_kwargs):
        raise RuntimeError("codex exec falló (timeout)")

    monkeypatch.setattr(starter, "subagente_detector", _falla)

    resultado = await supervisor(REPORTE_EJEMPLO)

    assert resultado["revision_manual"] is True
