# Plan de trabajo — Triage 072

## Objetivo

Completar el sistema Triage 072 como un monolito Express con worker asíncrono, RAG Python, Firebase, Twilio y React. La ruta canónica será:

`Formulario / WhatsApp / llamada → conversación y normalización → ingesta → cola → supervisor concurrente → RAG/MCP → ticket + acuse → consola admin en tiempo real`.

## 1. Fundamentos y seguridad

- [ ] Consolidar una sola implementación del supervisor: el backend TypeScript será la fuente de verdad; `assets/starter.py` queda solo como referencia y prueba del reto.
- [ ] Corregir las modificaciones pendientes, eliminar artefactos `.pyc`, confirmar pruebas y preparar commits finales hacia `develop`.
- [ ] Rotar la credencial Firebase expuesta en el entorno local y verificar que ninguna clave privada, token de Twilio, Groq, Google Maps o ngrok entre al repositorio.
- [ ] Unificar autorización: Firebase custom claims con `admin: true`, `categoria_admin` y un rol `superadmin`; eliminar compatibilidad ambigua con `role`, `rol` y `admin`.
- [ ] Crear diez permisos administrativos, uno por categoría: `bache`, `fuga_agua`, `alumbrado_apagado`, `semaforo_apagado`, `basura_acumulada`, `cable_caido`, `ruido_excesivo`, `arbol_riesgoso`, `riesgo_seguridad` y `drenaje_tapado`.
- [ ] Restringir a cada administrador a leer y modificar solo reportes/tickets de su categoría; `superadmin` administra usuarios, casos sin clasificar y operación global.
- [ ] Aplicar rate limiting, límites por IP/teléfono, idempotencia, validación de firmas Twilio, límites de carga y sanitización de errores para todos los endpoints públicos.
- [ ] Separar los MCP por privilegio: los agentes solo podrán consultar `buscar_similares` y Maps; crear tickets, enviar acuses, iniciar llamadas y actualizar Twilio solo podrá hacerlo código determinista del backend.
- [ ] Reducir trazas de agentes para no persistir transcripciones, teléfonos, prompts ni tokens completos; conservar solo IDs, duración, estado, herramienta y errores saneados.

## 2. Datos, cola y agentes

- [ ] Extender el modelo Firestore con `conversaciones`, `reportes`, `jobs_ingesta`, `tickets`, `evidencias`, `log_agentes`, `patrones` y `usuarios`.
- [ ] Guardar en cada conversación: canal, `CallSid` o teléfono, etapa, turnos, texto transcrito, ubicación candidata, coordenadas, expiración e idempotency key.
- [ ] Completar el worker con leasing atómico, reintentos exponenciales, trabajos vencidos, cola de revisión manual y métricas de profundidad/latencia.
- [ ] Configurar la demo para aceptar hasta 3 reportes simultáneos, con un límite de trabajos activos y límite adicional de procesos de agente por trabajo.
- [ ] Hacer que el supervisor ejecute clasificador, detector de patrones y escritor de acuse en paralelo; mantener evidencia y deduplicación como tareas condicionales.
- [ ] Aplicar y registrar las cinco reglas del reto, incluyendo ticket antes que acuse, `revision_manual` ante fallo y prioridad P0–P3.
- [ ] Crear el agente de aval de evidencias: valida correspondencia foto/video-descripción, detecta señales de riesgo, devuelve severidad y etiqueta; nunca reemplaza las reglas deterministas.
- [ ] Subir primero la evidencia al bucket y entregar al agente únicamente una URL firmada temporal o referencia controlada.
- [ ] Procesar los 10 reportes frescos por el backend real, comparar contra el oráculo y lograr al menos 8/10 urgencias correctas.

## 3. RAG y MCP

- [ ] Desplegar `rag-service` como proceso Python independiente y definir `RAG_SERVICE_URL`.
- [ ] Conectar `buscar_similares` al cliente HTTP RAG; retirar la búsqueda basada exclusivamente en fixtures locales.
- [ ] Implementar embeddings persistentes, similitud semántica, distancia Haversine, ventana temporal y actualización del índice al confirmar un reporte.
- [ ] Mantener Firestore como fuente de verdad; los históricos locales solo serán respaldo de desarrollo y pruebas.
- [ ] Completar el MCP Google Maps con geocodificación, búsqueda de lugar por texto y lugares cercanos; usar catálogo local solo como fallback verificable.
- [ ] Completar el MCP Twilio para WhatsApp y llamadas, con herramientas de salida limitadas al backend autorizado.
- [ ] Añadir health checks y fallbacks explícitos para RAG, Maps, Twilio y agentes; una caída debe dejar el reporte en revisión manual, no perderlo.

## 4. Conversación por WhatsApp y llamada

- [ ] Implementar un orquestador de diálogo con estado persistente; puede preguntar, confirmar y reanudar una conversación, pero no ejecutar herramientas mutables directamente.
- [ ] WhatsApp: aceptar texto, nota de voz, ubicación nativa, foto y dirección escrita; pedir solo los datos faltantes y confirmar antes de crear el reporte.
- [ ] Llamada Twilio: pedir primero una breve descripción, grabarla, almacenarla y transcribirla; después pedir la ubicación durante la misma llamada.
- [ ] Transcribir grabaciones con Groq mediante `GROQ_API_KEY`, `https://api.groq.com/openai/v1/audio/transcriptions`, idioma español y `whisper-large-v3` para priorizar precisión.
- [ ] Enviar el texto de ubicación al MCP Google Maps; si no hay una coincidencia única y confiable, pedir aclaración una vez y luego crear el caso como `revision_manual`.
- [ ] Mantener una conversación fluida con respuestas breves, máximo de turnos, protección contra bucles, expiración de sesión y opción de terminar/transferir a atención humana.
- [ ] Al crear el reporte por llamada, responder el folio por voz y enviar el acuse por WhatsApp/SMS mediante MCP Twilio; no enviar acuse si falla la creación del ticket.
- [ ] Validar todas las solicitudes Twilio con firma y deduplicar reintentos usando `MessageSid` y `CallSid`.

## 5. Evidencias y bucket Firebase

- [ ] Conectar el formulario, WhatsApp y llamadas al repositorio de Firebase Storage.
- [ ] Guardar fotos, videos, notas de voz y grabaciones con rutas por reporte, MIME validado, tamaño máximo y metadatos de origen.
- [ ] Validar firma binaria y tipo real del archivo; rechazar archivos ejecutables, contenedores inválidos y medios fuera de límite.
- [ ] Aplicar reglas de Storage: ciudadano propietario y administrador de categoría autorizada; las URLs firmadas expiran y no se guardan públicamente.
- [ ] Mostrar la evidencia aprobada y el resultado del agente en el detalle administrativo.

## 6. Backend, ngrok y webhooks locales

- [ ] Reestructurar el arranque local como una pila de desarrollo: backend Express, worker, RAG y túnel ngrok.
- [ ] Hacer que `npm run dev` inicie el backend y, cuando existan `NGROK_AUTHTOKEN`, credenciales Twilio y bandera de desarrollo, inicie ngrok automáticamente.
- [ ] Descubrir la URL HTTPS pública generada por ngrok, establecer `PUBLIC_BASE_URL` en memoria y actualizar automáticamente los webhooks de WhatsApp y Voice en Twilio.
- [ ] No almacenar la URL efímera de ngrok en Git ni modificar webhooks de producción; el automatismo será exclusivo de desarrollo local.
- [ ] Registrar la URL, endpoints configurados y resultado de la actualización sin exponer secretos.
- [ ] Montar y probar todas las rutas reales: ingesta, consulta pública, clarificación, Maps, WhatsApp, Voice, grabaciones, administración, eventos SSE y reproceso.

## 7. Frontend completamente integrado

- [ ] Conectar wizard, estatus público, mapa, carga de evidencia y clarificaciones a los endpoints reales; eliminar respuestas simuladas cuando `VITE_APP_MODE=api`.
- [ ] Implementar autenticación Firebase real y ocultar datos/acciones fuera de la categoría autorizada.
- [ ] Conectar la consola al listado real, detalle, evidencias, asignación, notas, seguimiento, prioridad, patrones y reproceso.
- [ ] Implementar SSE autenticado para mostrar reporte entrante, etapas de agentes pendientes/corriendo/listas y ticket final sin recargar.
- [ ] Mostrar P0–P3, regla gatillada, revisión manual, acuse, área, evidencia y patrón detectado.
- [ ] Añadir el mapa de reporte e históricos similares, más el contador global por prioridad para la demo.

## 8. Pruebas, operación y entrega

- [ ] Pruebas unitarias para roles, reglas, conversación, geocodificación, Groq, evidencia, MCPs, almacenamiento, cola, reintentos y límites de concurrencia.
- [ ] Pruebas de integración con emuladores Firebase, stubs de Twilio/Maps/Groq/RAG y validación de firmas.
- [ ] Pruebas E2E con Playwright: formulario→ticket, WhatsApp, flujo de llamada en dos pasos, permiso por categoría, SSE y reproceso.
- [ ] Instalar Chromium y completar la suite E2E pendiente.
- [ ] Ensayo de carga con 3 reportes simultáneos; verificar que cada uno conserve su conversación, trazas, evidencias y ticket.
- [ ] Añadir métricas de cola, duración por agente, fallos, reintentos, consumo de APIs y alertas por timeout/rate limit.
- [ ] Crear configuración reproducible de despliegue para backend, worker y RAG en host persistente; no usar FaaS efímero porque los agentes requieren CLI autenticado.
- [ ] Documentar variables de entorno, Firebase, Groq, Google Maps, Twilio, ngrok, ejecución local, webhooks y procedimiento de recuperación.
- [ ] Ejecutar auditoría final de ciberseguridad antes de publicar `develop`.

## Criterios de aceptación para la demo

- [ ] Un ciudadano puede crear un reporte por formulario, WhatsApp o llamada y recibir folio/acuse.
- [ ] La llamada solicita descripción y ubicación en pasos separados, geocodifica la ubicación y conserva la conversación.
- [ ] Las evidencias quedan almacenadas de forma privada en Firebase Storage y son evaluadas por el agente.
- [ ] El supervisor ejecuta agentes en paralelo, registra trazas y aplica las reglas del reto.
- [ ] La consola muestra el reporte, agentes, ticket, patrón, evidencia y prioridad en tiempo real.
- [ ] Un administrador solo opera la categoría que le corresponde.
- [ ] La aplicación procesa 3 reportes simultáneos sin pérdida, mezcla de contexto ni caída.
- [ ] El entorno local abre ngrok y actualiza automáticamente los webhooks de Twilio sin tocar producción.
