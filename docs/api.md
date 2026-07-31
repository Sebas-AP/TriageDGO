# Referencia de API — Sistema de Triage 072

## Backend (Express)

Base URL: `http://localhost:3000` (desarrollo)

### Ingesta de reportes

#### `POST /reportes/ingesta`

Crea un nuevo reporte desde cualquier canal (formulario, WhatsApp, llamada).

**Headers:**
- `Idempotency-Key` (opcional): clave de idempotencia
- `Authorization: Bearer <token>` (opcional): token Firebase

**Body (multipart/form-data):**

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `citizenName` | string | sí | Nombre del ciudadano |
| `phone` | string | sí | Teléfono de contacto |
| `consent` | boolean | sí | Consentimiento de tratamiento de datos |
| `description` | string | sí | Descripción del problema |
| `location` | JSON string | sí | `{"lat": number, "lng": number}` |
| `clarificationAnswer` | string | no | Respuesta a clarificación previa |
| `photo` | file | no | Imagen (JPEG/PNG/WebP, máx 5MB) |

**Response (202 Accepted):**
```json
{
  "reportId": "abc123",
  "folio": "abc123",
  "status": "received",
  "reporte_id": "abc123",
  "job_id": "job456",
  "estado": "encolado",
  "status_url": "/reportes/abc123"
}
```

**Errores:**
- `400 INVALID_REPORT`: datos inválidos
- `400 INVALID_ATTACHMENT`: archivo no válido
- `401 UNAUTHENTICATED`: token inválido
- `403 FORBIDDEN`: sin permisos

---

### Consulta de reportes

#### `GET /reportes/:reporteId`

Obtiene el estatus público de un reporte por folio.

**Response (200 OK):**
```json
{
  "id": "abc123",
  "folio": "abc123",
  "status": "processing",
  "location": { "address": "Ubicación recibida" },
  "createdAt": "2026-07-31T12:00:00Z"
}
```

**Status values:**
- `received`: encolado, pendiente de procesamiento
- `processing`: en proceso por el supervisor
- `ready`: completado con ticket
- `failed`: requiere revisión manual

**Errores:**
- `404`: reporte no encontrado

---

### Consola administrativa

#### `GET /admin/reportes`

Lista los reportes más recientes (requiere autenticación admin).

**Headers:**
- `Authorization: Bearer <token>` (requerido, claim `admin: true`)

**Query params:**
- `limite` (opcional): número de reportes (default 50, máx 200)

**Response (200 OK):**
```json
{
  "reportes": [
    {
      "reporte_id": "abc123",
      "texto": "Bache en la calle...",
      "coordenadas": [24.0, -104.0],
      "estado": "completado",
      "ticket_id": "ticket456",
      "created_at": "2026-07-31T12:00:00Z"
    }
  ]
}
```

**Errores:**
- `401 UNAUTHENTICATED`: sin token
- `403 FORBIDDEN`: sin rol admin

#### `GET /admin/reportes/:id`

Obtiene el detalle completo de un reporte (requiere autenticación admin).

**Response (200 OK):** objeto `Report` completo con ticket asociado.

**Errores:**
- `404`: reporte no encontrado

---

### Webhooks Twilio

#### `POST /webhooks/whatsapp`

Recibe mensajes de WhatsApp vía Twilio.

**Headers:**
- `X-Twilio-Signature`: firma HMAC-SHA1 de Twilio

**Body (application/x-www-form-urlencoded):**
- `From`: número del remitente
- `Body`: texto del mensaje
- `NumMedia`: número de archivos adjuntos
- `MediaUrl0`, `MediaContentType0`: URL y tipo de medio

**Response (200 OK):**
```xml
<?xml version="1.0" encoding="UTF-8"?><Response></Response>
```

**Errores:**
- `400`: falta remitente, media URL inválida, audio inválido
- `403`: firma inválida

---

### Endpoints consumidos por frontend

Estos endpoints son llamados por `frontend/src/services/api.ts`:

#### `POST /reportes/clarificacion`

Solicita clarificación sobre una descripción (no implementado en backend).

#### `GET /maps/autocomplete?q=<query>`

Autocompletado de direcciones vía Google Maps (no implementado en backend).

#### `GET /maps/geocode?placeId=<id>`

Geocodificación de place ID (no implementado en backend).

#### `GET /admin/eventos`

Stream SSE (Server-Sent Events) para actualizaciones en tiempo real.

**Headers:**
- `Authorization: Bearer <token>`
- `Accept: text/event-stream`
- `Last-Event-ID` (opcional): para reanudar desde último evento

**Formato SSE:**
```
id: event123
data: {"type": "report.created", "report": {...}}

id: event124
data: {"type": "ticket.created", "ticket": {...}}
```

#### `GET /admin/patrones`

Lista clusters de patrones detectados (no implementado en backend).

#### `PATCH /admin/reportes/:id/estado`

Actualiza el estado operativo de un reporte.

**Body:**
```json
{ "status": "en_proceso", "note": "Asignado a cuadrilla" }
```

#### `PATCH /admin/reportes/:id/asignacion`

Asigna un reporte a un responsable.

**Body:**
```json
{ "assignee": "Juan Pérez", "team": "Cuadrilla 3" }
```

#### `POST /admin/reportes/:id/seguimientos`

Programa un seguimiento.

**Body:**
```json
{ "scheduledAt": "2026-08-01T10:00:00Z", "note": "Verificar avance" }
```

#### `PATCH /admin/reportes/:id/seguimientos/:followUpId`

Marca un seguimiento como completado.

**Body:**
```json
{ "completed": true }
```

#### `POST /admin/reportes/:id/notas`

Agrega una nota al reporte.

**Body:**
```json
{ "text": "Se requiere maquinaria pesada" }
```

#### `PATCH /admin/reportes/:id/prioridad`

Cambia la prioridad manualmente.

**Body:**
```json
{ "priority": "P0", "reason": "Riesgo inminente" }
```

#### `POST /admin/patrones/:clusterId/incidencia`

Crea incidencia maestra para un cluster.

**Body:**
```json
{ "owner": "Director de Obras" }
```

#### `PATCH /admin/patrones/:clusterId/estado`

Actualiza el estado de un cluster.

**Body:**
```json
{ "status": "resuelto" }
```

---

## Microservicio RAG (Python/FastAPI)

Base URL: `http://127.0.0.1:8001` (desarrollo)

### Endpoints públicos

#### `GET /healthz`

Health check con estadísticas del índice.

**Response:**
```json
{
  "status": "ok",
  "reportes": 150,
  "predial": 500,
  "last_reconcile": "2026-07-31T12:00:00Z"
}
```

#### `POST /embed`

Genera embedding de un texto.

**Body:**
```json
{ "texto": "Bache en la calle principal" }
```

**Response:**
```json
{ "vector": [0.1, 0.2, ...], "dimension": 384 }
```

#### `POST /buscar_reportes`

Búsqueda semántica + geográfica de reportes históricos.

**Body:**
```json
{
  "texto": "Bache grande",
  "lat": 24.0,
  "lon": -104.0,
  "radio_km": 2.0,
  "dias": 90
}
```

**Response:**
```json
{
  "similares_encontrados": 5,
  "posible_causa_estructural": true,
  "ascenso_sugerido": true,
  "nota": "Patrón detectado en zona",
  "muestras": [
    { "reporte_id": "abc123", "categoria": "bache", "distancia_km": 0.3, "similitud": 0.85 }
  ]
}
```

#### `POST /buscar_pagos`

Consulta estado de predial por clave catastral o ubicación.

**Body:**
```json
{ "clave_catastral": "123456" }
```
o
```json
{ "ubicacion": "Calle 5 #123" }
```

**Response:**
```json
{
  "encontrado": true,
  "clave_catastral": "123456",
  "ubicacion": "Calle 5 #123",
  "al_corriente": true,
  "actualizado_en": "2026-07-01T00:00:00Z",
  "nota": "Pago al corriente"
}
```

### Endpoints autenticados

Requieren header `Authorization: Bearer <RAG_INTERNAL_TOKEN>`.

#### `POST /index/rebuild`

Reconstruye el índice completo desde Firestore.

**Body:**
```json
{ "force": true }
```

**Response:**
```json
{ "reportes": 150, "predial": 500 }
```

#### `POST /index/reportes/:reporteId`

Indexa un reporte específico (llamado por el worker tras confirmar ticket).

**Response:**
```json
{ "reportes": 151 }
```

---

## Servidores MCP

Los servidores MCP (Model Context Protocol) son invocados por los agentes
durante su ejecución vía `codex exec`.

### MCP Reportes

**Tools:**
- `buscar_similares(texto, lat, lon, radio_km, dias)`: búsqueda semántica
- `crear_ticket(...)`: crea ticket en Firestore (solo backend)
- `enviar_acuse(ciudadano_id, mensaje)`: envía WhatsApp (solo backend)

### MCP Twilio

**Tools:**
- `enviar_whatsapp(destino, mensaje)`: envía mensaje WhatsApp
- `iniciar_llamada(numero)`: inicia llamada
- `recibir_grabacion(call_sid)`: obtiene grabación de llamada

### MCP Google Maps

**Tools:**
- `geocodificar(direccion)`: dirección → coordenadas
- `buscar_lugar(descripcion, sesgo_ubicacion)`: descripción libre → candidatos
- `distancia(lat, lon, destino)`: cálculo de distancia
- `lugares_cercanos(lat, lon, tipo)`: búsqueda de POIs cercanos
