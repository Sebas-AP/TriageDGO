# Requisitos — Agente Clasificador (`classifier`)

**Rol:** recibe `{texto, coordenadas}` de un reporte ciudadano y determina su categoría, urgencia base y área responsable.

**Debe devolver (ver `agents/contracts/classifier.schema.json`):**
- `categoria`: uno de los 10 ids exactos de `categorias.json` (nunca inventar categorías nuevas).
- `urgencia_base` y `area_responsable`: **lookup determinista** — deben coincidir EXACTAMENTE con lo que dice `categorias.json` para esa `categoria`. No son criterio libre del agente.
- `resumen`: 1-2 líneas que resuman el reporte.
- `palabras_clave`: 2-5 términos relevantes extraídos del texto.

**No debe hacer:**
- No decide `urgencia_final` ni `prioridad_final` — eso es del Supervisor, tras arbitraje con los demás agentes.
- No debe usar ninguna tool MCP (no la necesita).

**Fuente de verdad para pruebas:** `categorias.json` (taxonomía completa) + `reportes_frescos.jsonl` (10 reportes reales) + `reportes_frescos_esperado.json` (categoría correcta esperada por cada uno). Los 10 casos de `agents/tests/cases/classifier.cases.json` están construidos directamente de estos archivos.

**Compatibilidad con el orquestador:** el Supervisor consume esta salida junto con la de `pattern` y `evidence` para calcular `urgencia_final`/`prioridad_final` (ver `arq.md` §3.4). El campo `area_responsable` se usa tal cual para el ticket final — un valor mal escrito rompe el pipeline downstream.
