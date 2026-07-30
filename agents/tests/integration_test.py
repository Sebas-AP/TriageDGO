"""
Prueba de integración: valida que los agentes generados por agent-tdd-builder
puedan ejecutarse EN PARALELO tal como lo hará el Supervisor real
(asyncio.gather / Promise.allSettled — ver arq.md §3.1 y el stub `supervisor()`
en starter.py), y que sus salidas combinadas tengan la forma que el
orquestador necesita para consolidar un ticket.

A diferencia de harness.py (prueba unitaria por agente), esto NO valida
corrección semántica caso por caso — valida INTEROPERABILIDAD:
- ¿corren en paralelo sin bloquearse entre sí?
- ¿cada uno devuelve JSON válido según su contrato?
- ¿un fallo de un agente no tumba a los demás (Regla 3 / allSettled)?

Reutiliza claude_p_async de starter.py — el mismo helper que usará el
supervisor real, en vez de reimplementar el paralelismo aquí.

Uso:
    python3 agents/tests/integration_test.py                     # classifier+pattern+acuse
    python3 agents/tests/integration_test.py classifier pattern acuse evidence
"""
from __future__ import annotations

import asyncio
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
AGENTS_DIR = Path(__file__).resolve().parent.parent
PROMPTS_DIR = AGENTS_DIR / "prompts"
CONTRACTS_DIR = AGENTS_DIR / "contracts"

sys.path.insert(0, str(REPO_ROOT))
from starter import claude_p_async  # mismo helper que usará el Supervisor real

REPORTE_SMOKE = {
    "reporte_id": "SMOKE-01",
    "texto": "hay un bache enorme en la esquina, ya son varios reportes en la misma cuadra",
    "coordenadas": [24.0291, -104.6293],
    "ciudadano_id": "cd-smoke-001",
}


async def _invoke(agent_name: str) -> dict:
    prompt_path = PROMPTS_DIR / f"{agent_name}.md"
    schema_path = CONTRACTS_DIR / f"{agent_name}.schema.json"
    if not prompt_path.exists() or not prompt_path.read_text(encoding="utf-8").strip():
        raise FileNotFoundError(f"{prompt_path} no existe o está vacío — corre agent-tdd-builder primero")

    system_prompt = prompt_path.read_text(encoding="utf-8")
    schema = json.loads(schema_path.read_text(encoding="utf-8"))
    return await claude_p_async(
        json.dumps(REPORTE_SMOKE, ensure_ascii=False),
        system=system_prompt,
        schema=schema,
        timeout=60,
    )


async def main(agent_names: list[str]) -> bool:
    print(f"[i] Invocando en paralelo (asyncio.gather, como el Supervisor): {agent_names}")
    tasks = [asyncio.create_task(_invoke(name)) for name in agent_names]
    # return_exceptions=True == comportamiento de Promise.allSettled (Regla 3):
    # un fallo de un agente no debe tumbar a los demás.
    results = await asyncio.gather(*tasks, return_exceptions=True)

    ok = True
    for name, res in zip(agent_names, results):
        if isinstance(res, Exception):
            ok = False
            print(f"  [FALLO] {name}: {res}")
        else:
            print(f"  [OK]    {name}: {json.dumps(res, ensure_ascii=False)}")

    print(f"\n[i] Resultado integración (paralelo tipo Supervisor): {'OK' if ok else 'FALLO'}")
    return ok


if __name__ == "__main__":
    names = sys.argv[1:] or ["classifier", "pattern", "acuse"]
    exit_ok = asyncio.run(main(names))
    sys.exit(0 if exit_ok else 1)
