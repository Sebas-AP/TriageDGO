# Requisitos — Agente de Evidencias (`evidence`)

**Rol:** recibe la descripción textual del reporte + una imagen adjunta (evaluada con la capacidad de visión nativa de Claude, sin API externa de terceros — ver `arq.md` §3.2).

**Debe devolver (ver `agents/contracts/evidence.schema.json`):**
- `corresponde_a_descripcion`: `true`/`false` — ¿la imagen corresponde a lo que describe el texto?
- `severidad`: `baja|media|alta|critica` — severidad visual estimada (tamaño del daño, riesgo visible).
- `senales_detectadas`: lista de señales concretas observadas (ej. `"cable expuesto"`, `"agua acumulada"`).
- `etiqueta_contexto`: etiqueta corta que el Clasificador puede usar como contexto adicional.

**No debe hacer:**
- No reemplaza las reglas de prioridad del Supervisor — su output es **una entrada más** para el Clasificador, no una decisión final.

**Fuente de verdad para pruebas:** este repo no incluye un dataset de imágenes etiquetadas todavía. Los casos en `agents/tests/cases/evidence.cases.json` son **sintéticos** y validan solo forma/estructura del JSON de salida, no corrección semántica sobre una imagen real. Cuando exista un dataset de evidencias reales, ampliar los casos con assertions de contenido.

**Compatibilidad con el orquestador:** el Supervisor solo invoca este agente si el reporte trae foto/video adjunto; si falta, se omite del `Promise.allSettled` (no cuenta como fallo).
