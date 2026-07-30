"""Las 5 reglas de arbitraje del Supervisor (arq.md §3.1, §3.4). FASE ROJA
esperada — la consolidación vive en `starter.supervisor`, que aún es un
stub (`NotImplementedError`). Estas pruebas fijan el comportamiento que la
implementación debe alcanzar (ver CLAUDE.md, fase TDD siguiente)."""
from __future__ import annotations

import pytest

from starter import supervisor
from tests.contracts import EXAMPLE_OUTPUTS

REPORTE_BASE = {
    "texto": "Cable caído sobre la banqueta frente a la primaria.",
    "coordenadas": [25.686, -100.316],
    "ciudadano_id": "ciu-002",
}


@pytest.mark.asyncio
async def test_regla_1_patron_mas_causa_estructural_sube_a_alta_minimo(mock_claude_p, monkeypatch) -> None:
    """Similares ≥10 + causa estructural ⇒ urgencia mínima 'alta'."""
    import starter

    async def _clasificador(_reporte):
        return {**EXAMPLE_OUTPUTS["classifier"], "urgencia_base": "baja"}

    async def _detector(_reporte):
        return {
            "similares_encontrados": 12,
            "posible_causa_estructural": True,
            "ascenso_sugerido": True,
            "nota": "12 similares en la zona.",
        }

    monkeypatch.setattr(starter, "subagente_clasificador", _clasificador)
    monkeypatch.setattr(starter, "subagente_detector", _detector)

    resultado = await supervisor(REPORTE_BASE)

    assert resultado["urgencia_final"] in {"alta", "critica"}
    assert resultado["regla_gatillada"] == "regla_1_patron_estructural"


@pytest.mark.asyncio
async def test_regla_2_categoria_critica_cerca_de_escuela_sube_a_critica(mock_claude_p, monkeypatch) -> None:
    """Categoría de riesgo + <500m de escuela ⇒ urgencia 'critica'."""
    import starter

    async def _clasificador(_reporte):
        return {**EXAMPLE_OUTPUTS["classifier"], "categoria": "cable_caido", "urgencia_base": "alta"}

    monkeypatch.setattr(starter, "subagente_clasificador", _clasificador)
    monkeypatch.setattr(starter, "esta_cerca_de_escuela", lambda *_a, **_k: (True, "Primaria Benito Juárez"))

    resultado = await supervisor(REPORTE_BASE)

    assert resultado["urgencia_final"] == "critica"
    assert resultado["regla_gatillada"] == "regla_2_cercania_escuela"


@pytest.mark.asyncio
async def test_regla_3_fallo_de_subagente_marca_revision_manual(mock_claude_p, monkeypatch) -> None:
    import starter

    async def _falla(*_args, **_kwargs):
        raise RuntimeError("rate limit")

    monkeypatch.setattr(starter, "subagente_escritor", _falla)

    resultado = await supervisor(REPORTE_BASE)

    assert resultado["revision_manual"] is True


@pytest.mark.asyncio
async def test_regla_4_ticket_se_crea_antes_de_enviar_acuse(mock_claude_p) -> None:
    resultado = await supervisor(REPORTE_BASE)

    assert resultado["ticket_id"] is not None
    assert resultado["acuse_enviado"] is True
    assert resultado.get("orden_ticket_antes_de_acuse", True) is True


@pytest.mark.parametrize(
    ("urgencia", "prioridad_esperada"),
    [("critica", "P0"), ("alta", "P1"), ("media", "P2"), ("baja", "P3")],
)
@pytest.mark.asyncio
async def test_regla_5_mapping_fijo_urgencia_a_prioridad(
    mock_claude_p, monkeypatch, urgencia: str, prioridad_esperada: str
) -> None:
    import starter

    async def _clasificador(_reporte):
        return {**EXAMPLE_OUTPUTS["classifier"], "urgencia_base": urgencia}

    monkeypatch.setattr(starter, "subagente_clasificador", _clasificador)

    resultado = await supervisor(REPORTE_BASE)

    assert resultado["prioridad_final"] == prioridad_esperada
