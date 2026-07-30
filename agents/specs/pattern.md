# Requisitos — Agente Detector de Patrones (`pattern`)

**Rol:** recibe `{texto, coordenadas}` de un reporte y debe **invocar la tool MCP `buscar_similares(texto, lat, lon, radio_km, dias)`** (disponible en su propia sesión vía `--mcp-config`) para decidir si el reporte forma parte de un patrón recurrente.

**Debe devolver (ver `agents/contracts/pattern.schema.json`):**
- `similares_encontrados`: el número que devolvió la tool — **copiarlo tal cual, nunca inventarlo**.
- `posible_causa_estructural`: `true` si el volumen/patrón de similares sugiere una causa recurrente (ej. muchos reportes similares en poco tiempo y radio pequeño).
- `ascenso_sugerido`: `true` si recomienda subir la prioridad un nivel (nunca proponer bajarla).
- `nota`: breve justificación en texto.

**Restricción crítica:** el agente **debe llamar siempre** la tool `buscar_similares` antes de responder — nunca debe razonar sin haberla invocado primero. Un caso de prueba que pase con `similares_encontrados` inventado (no igual al que devuelve la tool mock) se considera una prueba fallida aunque el JSON tenga la forma correcta.

**Fuente de verdad para pruebas:** `agents/tests/mock_mcp_server.py` + `agents/tests/mock_mcp_fixtures.json` — respuestas fijas y deterministas de `buscar_similares`, para desacoplar la prueba del prompt de la implementación real (aún no construida) del motor de similitud semántica (`sentence-transformers`, ver `arq.md` §5).

**Compatibilidad con el orquestador:** el Supervisor usa `posible_causa_estructural` + `similares_encontrados` para la Regla 1 de arbitraje (similares ≥10 + causa estructural ⇒ mínimo prioridad alta).
