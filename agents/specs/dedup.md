# Requisitos — Agente Detector de Duplicados (`dedup`, nivel Pro)

**Rol:** recibe el reporte nuevo + una lista de reportes recientes cercanos (candidatos, ya prefiltrados por proximidad/tiempo) y decide si es duplicado de uno existente.

**Debe devolver (ver `agents/contracts/dedup.schema.json`):**
- `duplicado_detectado`: `true`/`false`.
- `reporte_id_original`: si `duplicado_detectado` es `true`, debe ser uno de los ids de la lista de candidatos recibida (nunca inventar un id que no vino en el input); si es `false`, debe ser `null`.
- `confianza`: número entre 0 y 1.
- `justificacion`: breve texto explicando la decisión.

**Fuente de verdad para pruebas:** casos sintéticos en `agents/tests/cases/dedup.cases.json` con listas de candidatos controladas — se valida que `reporte_id_original` (cuando no es null) sea consistente con la lista de entrada y que `confianza` esté en rango.

**Compatibilidad con el orquestador:** es un agente opcional (nivel Pro); si el Supervisor lo omite, el pipeline sigue igual sin él (no es parte de las reglas de arbitraje base 1-5).
