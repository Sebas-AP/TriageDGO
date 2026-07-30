# Requisitos — Agente Escritor de Acuse (`acuse`)

**Rol:** recibe `{texto, ciudadano_id}` (y opcionalmente `categoria`) y redacta un mensaje breve, empático y directo confirmando que el reporte fue recibido. **No consulta ninguna tool ni tiene acceso a MCP** — solo redacta con lo que recibe en el prompt.

**Debe devolver (ver `agents/contracts/acuse.schema.json`):**
- `mensaje`: máximo 3 líneas, tono empático, sin tecnicismos.

**No debe hacer:**
- No debe inventar un `ticket_id` (aún no existe en este punto del pipeline — el Supervisor lo crea después vía `MCP crear_ticket`, Regla 4: ticket antes que acuse).
- No debe prometer tiempos de resolución específicos ("en 24 horas", "mañana mismo") que el sistema no puede garantizar.
- No debe incluir URLs ni enlaces inventados.

**Fuente de verdad para pruebas:** al no haber "respuesta correcta" única para texto libre, los casos en `agents/tests/cases/acuse.cases.json` validan forma y restricciones (longitud, ausencia de ticket_id/URLs inventados), no el contenido exacto del mensaje.

**Compatibilidad con el orquestador:** el Supervisor solo usa este `mensaje` DESPUÉS de crear el ticket (Regla 4); nunca lo envía si `crear_ticket` falló.
