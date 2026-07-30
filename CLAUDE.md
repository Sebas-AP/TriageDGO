# Sistema de Triage Inteligente 072

Triage de reportes ciudadanos (bache, fuga de agua, cable caído, etc.)
mediante 6 agentes de razonamiento (`classifier`, `pattern`, `acuse`,
`evidence`, `dedup`, `escalation`) orquestados en paralelo por un
Supervisor. Ver `arq.md` para la arquitectura completa (capas, MCP
servers, reglas de arbitraje, colecciones Firestore).

## Dos tracks que conviven en este repo

1. **Producto/capstone real** — `backend/` (Express + TypeScript +
   Firebase) y `frontend/` (React + Vite + TypeScript). Arquitectura de
   3 capas (presentation/business/data) descrita en `arq.md §3`.
2. **Fábrica de agentes + fixtures Python** — `agents/` (specs,
   contratos JSON Schema y harness de los 6 agentes), `assets/`
   (taxonomía, fixtures de reportes, `starter.py` de referencia) y
   `tests/` (contratos pydantic + mocks para probar la orquestación sin
   invocar `claude -p`). Es independiente del lenguaje del backend.

Cada agente de razonamiento es un **archivo `.md`** con system prompt
(vive en `agents/prompts/`, aún no generado), invocado como proceso CLI
`claude -p --model haiku-4.5 --json-schema ...` — no es código
TypeScript. `agents/contracts/*.schema.json` es la única fuente de
verdad de cada contrato de salida; los modelos pydantic en
`tests/contracts.py` se derivan de ahí y `tests/test_contracts.py`
verifica que no diverjan.

## Estructura

```
agents/       fábrica TDD de los 6 prompts (specs, contracts, tests con claude -p real)
assets/       taxonomía, fixtures de reportes, starter.py de referencia (Python)
backend/      Express + TS + Firebase (esqueleto, sin lógica de negocio aún)
frontend/     React + Vite + TS (esqueleto)
tests/        contratos pydantic + mocks de claude_p (fase red actual)
starter.py    shim en raíz que re-exporta assets/starter.py
```

## Comandos clave

```bash
# Validar un prompt de agente contra claude -p real
python3 agents/tests/harness.py <agente> --verbose

# Prueba de paralelismo tipo Supervisor
python3 agents/tests/integration_test.py <agente...>

# Contratos + orquestación de referencia (mock de claude_p, sin CLI real)
pytest tests/ -v

# Backend / frontend (una vez con dependencias instaladas)
cd backend && npm test
cd frontend && npm test
```

## Convenciones

- `agents/tests/*` es infraestructura de la fábrica TDD: no se edita a
  mano, se usa vía `.claude/agents/agent-tdd-builder.md`.
- `backend/src/business/agents/prompts/` debe apuntar (symlink) a
  `agents/prompts/` una vez exista, para no duplicar los `.md`.
- Todos los agentes usan `haiku-4.5` por defecto; usar `opus-4.8` solo
  con justificación documentada.
