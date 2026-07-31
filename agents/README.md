# Fábrica TDD de agentes — Sistema de Triage 072

Infraestructura para construir, con un ciclo inspirado en TDD, los 6 subagentes de razonamiento descritos en `arq.md` (`classifier`, `pattern`, `acuse`, `evidence`, `dedup`, `escalation`). Cada agente termina siendo un archivo `.md` en `agents/prompts/` que el Supervisor invoca como sesión `claude -p --model haiku-4.5` (ver `arq.md` §3.1–§3.3).

## Cómo usarlo

**Forma recomendada — vía el subagente de Claude Code:**
En una sesión de Claude Code, pide algo como:
> "usa agent-tdd-builder para armar el agente classifier"
> "usa agent-tdd-builder para arreglar el agente pattern, está fallando"
> "usa agent-tdd-builder para armar todos los agentes"

Esto invoca `.claude/agents/agent-tdd-builder.md`, que ejecuta el ciclo completo: lee requisitos → revisa/completa el checklist de pruebas → escribe/edita el `.md` → corre el harness → itera hasta pasar (máx. 6 intentos) → valida compatibilidad con el orquestador.

**Forma manual — correr el harness tú mismo:**
```bash
cd triage072-reto03
pip install -r requirements.txt   # necesita mcp[cli] y jsonschema

# probar un agente puntual (requiere que agents/prompts/<nombre>.md ya tenga contenido)
python3 agents/tests/harness.py classifier --verbose

# probar que corran en paralelo como el Supervisor (asyncio.gather)
python3 agents/tests/integration_test.py classifier pattern acuse
```

## Estructura

| Carpeta | Contenido | ¿Quién la edita? |
|---|---|---|
| `specs/` | Requisitos de cada agente (qué debe hacer) | Solo lectura para el builder |
| `contracts/` | JSON Schema de la salida esperada de cada agente | Solo lectura para el builder |
| `prompts/` | **El "código"**: system prompt real de cada agente | El builder itera aquí libremente |
| `tests/cases/` | Checklist de pruebas (TDD) por agente | El builder puede añadir casos si la spec lo exige |
| `tests/harness.py` | Motor que corre `claude -p` contra un prompt y valida | Infraestructura, no se edita por agente |
| `tests/integration_test.py` | Prueba de paralelismo tipo Supervisor | Infraestructura |
| `tests/mock_mcp_server.py` + `mock_mcp_fixtures.json` | MCP falso (respuestas fijas) para probar `pattern` sin depender del motor de similitud real (aún no construido) | Infraestructura |

## Por qué el mock de MCP para `pattern`

El motor real de similitud semántica (`sentence-transformers`, microservicio RAG — `arq.md` §5) todavía no está construido en este repo. Si las pruebas de `pattern` dependieran de él, estaríamos probando dos cosas incompletas a la vez. El mock (`mock_mcp_server.py`) devuelve respuestas **fijas y deterministas** de `buscar_similares`, así el harness valida solo el razonamiento del prompt de `pattern` (dado que la tool devolvió X similares, ¿decide bien `posible_causa_estructural`/`ascenso_sugerido`?), no la corrección del algoritmo de similitud. Cuando el RAG real exista, se puede apuntar `--mcp-config` al servidor real y reusar los mismos `.md` ya validados.

## Limitación conocida: `evidence`

No hay dataset de imágenes reales en este repo todavía. Los casos de `agents/tests/cases/evidence.cases.json` son sintéticos y solo validan la **forma** del JSON de salida, no que el análisis visual sea correcto sobre una imagen real. Cuando exista un set de imágenes etiquetadas, ampliar esos casos con `expect_equals`/`expect_in` sobre `severidad`/`senales_detectadas` reales.

## Agentes

| Agente | Propósito | Salida (campos) | MCP | Prompt |
|---|---|---|---|---|
| `classifier` | Clasifica el reporte en categoría, urgencia base y área responsable | `categoria` (enum 10), `urgencia_base` (baja/media/alta/critica), `area_responsable`, `resumen`, `palabras_clave[]` | No | `prompts/classifier.md` |
| `pattern` | Detecta patrones estructurales y reportes similares | `similares_encontrados` (int), `posible_causa_estructural` (bool), `ascenso_sugerido` (bool), `nota` | Sí (`buscar_similares`) | `prompts/pattern.md` |
| `acuse` | Redacta mensaje de acuse al ciudadano | `mensaje` (string) | No | `prompts/acuse.md` |
| `evidence` | Analiza foto/video adjunto, valida correspondencia y severidad | `corresponde_a_descripcion` (bool), `severidad` (enum), `senales_detectadas[]`, `etiqueta_contexto` | No | `prompts/evidence.md` |
| `dedup` | Detecta si el reporte es duplicado de uno reciente | `duplicado_detectado` (bool), `reporte_id_original` (string/null), `confianza` (0-1), `justificacion` | No | `prompts/dedup.md` |
| `escalation` | Decide si escalar a director de área | `debe_escalar` (bool), `director_area`, `mensaje_escalamiento`, `motivo` | No | `prompts/escalation.md` |

Todos los agentes se ejecutan vía `codex exec` con el modelo configurado en
`CODEX_MODEL` (default: `gpt-5.6-luna`). Cada agente es un archivo `.md`
en `prompts/` con su system prompt, y su contrato de salida está definido
en `contracts/*.schema.json`.

## Coherencia con `arq.md`

- Modelo: todos los agentes usan el modelo configurado en `CODEX_MODEL` (ver `arq.md` §3.1, §3.3, §8).
- MCP dentro de la sesión: solo `pattern` (y potencialmente `evidence`/`escalation`) reciben `--mcp-config`; `classifier` y `acuse` no lo necesitan (ver `arq.md` §4).
- Cada invocación es un proceso nuevo, sin estado persistente entre llamadas — el harness y la prueba de integración respetan esto (una llamada `claude -p` = un subproceso).
