# Requisitos — Agente de Escalamiento (`escalation`, nivel Extremo)

**Rol:** se invoca **solo** cuando el Supervisor ya determinó `urgencia_final: critica` y proximidad <500m a una escuela (después de la consolidación, no en el `Promise.allSettled` inicial — ver `arq.md` §3.1). Decide si debe escalar a un director de área y redacta el mensaje de escalamiento.

**Debe devolver (ver `agents/contracts/escalation.schema.json`):**
- `debe_escalar`: normalmente `true` (el Supervisor ya filtró el caso antes de invocar este agente), pero puede ser `false` si el contexto no lo amerita — debe justificarlo en `motivo`.
- `director_area`: a qué dirección/área escalar.
- `mensaje_escalamiento`: mensaje breve para notificar al director.
- `motivo`: por qué se escala (o por qué no).

**Fuente de verdad para pruebas:** casos sintéticos en `agents/tests/cases/escalation.cases.json` basados en escenarios de `arq.md` §3.4 (categoría de riesgo + cercanía a escuela).

**Compatibilidad con el orquestador:** se ejecuta DESPUÉS de la consolidación del Supervisor (no en paralelo con los otros 5 agentes) — ver diagrama en `arq.md` §3.1/§7.
