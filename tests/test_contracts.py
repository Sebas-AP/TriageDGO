"""Verifica que tests/contracts.py (pydantic v2) no diverja de
agents/contracts/*.schema.json (fuente de verdad, ver CLAUDE.md)."""
from __future__ import annotations

import json
from pathlib import Path

import jsonschema
import pytest

from tests.contracts import CONTRACTS, EXAMPLE_OUTPUTS as VALID_EXAMPLES

REPO_ROOT = Path(__file__).resolve().parent.parent
CONTRACTS_DIR = REPO_ROOT / "agents" / "contracts"


@pytest.fixture(params=sorted(CONTRACTS))
def agent_name(request) -> str:
    return request.param


def _load_schema(agent_name: str) -> dict:
    path = CONTRACTS_DIR / f"{agent_name}.schema.json"
    return json.loads(path.read_text(encoding="utf-8"))


def test_contrato_existe_para_cada_agente(agent_name: str) -> None:
    assert (CONTRACTS_DIR / f"{agent_name}.schema.json").exists()


def test_campos_requeridos_coinciden_con_el_schema(agent_name: str) -> None:
    schema = _load_schema(agent_name)
    model_schema = CONTRACTS[agent_name].model_json_schema()

    assert set(model_schema.get("required", [])) == set(schema["required"])
    assert set(model_schema["properties"]) == set(schema["properties"])


def test_no_permite_propiedades_adicionales(agent_name: str) -> None:
    schema = _load_schema(agent_name)
    assert schema.get("additionalProperties") is False
    assert CONTRACTS[agent_name].model_config.get("extra") == "forbid"


def test_ejemplo_valido_pasa_jsonschema_y_pydantic(agent_name: str) -> None:
    schema = _load_schema(agent_name)
    example = VALID_EXAMPLES[agent_name]

    jsonschema.validate(example, schema)
    model = CONTRACTS[agent_name](**example)
    assert model.model_dump() == example


def test_propiedad_extra_falla_en_ambos(agent_name: str) -> None:
    schema = _load_schema(agent_name)
    example = {**VALID_EXAMPLES[agent_name], "campo_no_declarado": "x"}

    with pytest.raises(jsonschema.ValidationError):
        jsonschema.validate(example, schema)
    with pytest.raises(Exception):
        CONTRACTS[agent_name](**example)
