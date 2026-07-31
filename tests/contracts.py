"""Modelos pydantic v2 de los contratos de salida de los 6 agentes.

Fuente de verdad: agents/contracts/*.schema.json (JSON Schema). Estos modelos
se derivan a mano de esos schemas; test_contracts.py verifica que no diverjan.
"""
from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

CATEGORIA = Literal[
    "bache",
    "fuga_agua",
    "alumbrado_apagado",
    "semaforo_apagado",
    "basura_acumulada",
    "cable_caido",
    "ruido_excesivo",
    "arbol_riesgoso",
    "riesgo_seguridad",
    "drenaje_tapado",
]
URGENCIA = Literal["baja", "media", "alta", "critica"]


class ClassifierOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    categoria: CATEGORIA
    urgencia_base: URGENCIA
    area_responsable: str
    resumen: str
    palabras_clave: list[str] = Field(min_length=1)


class PatternOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    similares_encontrados: int = Field(ge=0)
    posible_causa_estructural: bool
    ascenso_sugerido: bool
    nota: str


class AcuseOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mensaje: str


class EvidenceOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    corresponde_a_descripcion: bool
    severidad: URGENCIA
    senales_detectadas: list[str]
    etiqueta_contexto: str


class DedupOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    duplicado_detectado: bool
    reporte_id_original: str | None
    confianza: float = Field(ge=0, le=1)
    justificacion: str


class EscalationOutput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    debe_escalar: bool
    director_area: str
    mensaje_escalamiento: str
    motivo: str


CONTRACTS: dict[str, type[BaseModel]] = {
    "classifier": ClassifierOutput,
    "pattern": PatternOutput,
    "acuse": AcuseOutput,
    "evidence": EvidenceOutput,
    "dedup": DedupOutput,
    "escalation": EscalationOutput,
}

# Ejemplos válidos por agente — usados por test_contracts.py (round-trip contra
# el JSON Schema) y por el fixture mock_codex_exec (conftest.py) como respuesta
# canned de cada agente al probar la orquestación sin invocar Codex real.
EXAMPLE_OUTPUTS: dict[str, dict] = {
    "classifier": {
        "categoria": "bache",
        "urgencia_base": "alta",
        "area_responsable": "Obras Públicas",
        "resumen": "Bache profundo en vía principal.",
        "palabras_clave": ["bache", "via_principal"],
    },
    "pattern": {
        "similares_encontrados": 3,
        "posible_causa_estructural": True,
        "ascenso_sugerido": True,
        "nota": "3 reportes similares en 500m / 30 días.",
    },
    "acuse": {"mensaje": "Recibimos tu reporte, folio DUR-2024-0001."},
    "evidence": {
        "corresponde_a_descripcion": True,
        "severidad": "media",
        "senales_detectadas": ["agua_acumulada"],
        "etiqueta_contexto": "fuga visible en banqueta",
    },
    "dedup": {
        "duplicado_detectado": False,
        "reporte_id_original": None,
        "confianza": 0.1,
        "justificacion": "Sin coincidencias cercanas.",
    },
    "escalation": {
        "debe_escalar": True,
        "director_area": "Obras Públicas",
        "mensaje_escalamiento": "Cable caído a <500m de escuela.",
        "motivo": "critica + cercania_escuela",
    },
}
