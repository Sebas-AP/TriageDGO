# Contrato esperado por el frontend

Este documento describe la interfaz que el modo `api` consume. No implica una implementación del backend.

## Convenciones

- Base URL: `VITE_API_BASE_URL`.
- JSON usa `camelCase`.
- Las fechas usan ISO 8601.
- Los endpoints administrativos reciben `Authorization: Bearer <Firebase ID token>`.
- Los errores responden `{ "message": "Descripción segura para el usuario" }`.

## Mapas

### `GET /maps/autocomplete?q=<texto>`

```json
[
  {
    "placeId": "identificador",
    "label": "Avenida 20 de Noviembre",
    "context": "Zona Centro, Durango"
  }
]
```

### `GET /maps/geocode?placeId=<id>`

```json
{
  "placeId": "identificador",
  "address": "Dirección normalizada",
  "lat": 24.0277,
  "lng": -104.6532
}
```

## Reportes ciudadanos

### `POST /reportes/clarificacion`

Entrada JSON: `{ "description": "...", "revision": 2 }`.

Salida: `{ "question": "Pregunta opcional" | null, "revision": 2 }`.

### `POST /reportes/ingesta`

Contenido `multipart/form-data`:

- `citizenName`
- `phone`
- `consent`
- `description`
- `location`: JSON serializado con `address`, `lat`, `lng` y `placeId` opcional
- `clarificationAnswer`: opcional
- `photo`: JPEG, PNG o WebP opcional

Respuesta `202`:

```json
{
  "reportId": "uuid",
  "folio": "DGO-2026-0073",
  "status": "received"
}
```

### `GET /reportes/:folio`

Devuelve `ReportRecord` o `404`. Solo debe exponer información segura para seguimiento ciudadano.

## Administración

### `GET /admin/reportes`

Devuelve `ReportRecord[]` como snapshot inicial, ordenado del más reciente al más antiguo.

### `GET /admin/eventos`

Canal `text/event-stream`. Debe aceptar `Last-Event-ID`. Cada bloque incluye `id` y un `data` JSON con:

- `report.received`: payload `ReportRecord`.
- `agent.status`: payload `{ agent, status, error? }`.
- `ticket.ready`: payload `Ticket`.
- `report.failed`: payload `{ message }`.

Los tipos completos están definidos en `src/types.ts`.

## Gestión operativa

Las siguientes operaciones son consumidas por la Mesa de Control. Todas requieren rol `admin`.

| Operación | Endpoint |
|---|---|
| Cambiar estado | `PATCH /admin/reportes/:id/estado` |
| Asignar responsable/cuadrilla | `PATCH /admin/reportes/:id/asignacion` |
| Crear seguimiento | `POST /admin/reportes/:id/seguimientos` |
| Completar seguimiento | `PATCH /admin/reportes/:id/seguimientos/:seguimientoId` |
| Agregar nota | `POST /admin/reportes/:id/notas` |
| Ajustar prioridad | `PATCH /admin/reportes/:id/prioridad` |
| Consultar problemas frecuentes | `GET /admin/patrones` |
| Crear incidencia maestra | `POST /admin/patrones/:id/incidencia` |
| Cambiar estado del patrón | `PATCH /admin/patrones/:id/estado` |

Un reporte administrativo incluye:

- Canal `form | whatsapp | call | manual`.
- Estado de procesamiento y estado operativo por separado.
- Responsable, cuadrilla y fecha compromiso.
- Seguimientos programados.
- Notas internas.
- Bitácora inmutable de acciones.
- Referencia opcional a un problema frecuente.

Los cambios administrativos deben producir un evento `report.updated` en el canal SSE para mantener sincronizadas todas las consolas.

## Problemas frecuentes

`GET /admin/patrones` devuelve `ProblemCluster[]`. Cada agrupación contiene categoría, zona, radio, tendencia, cantidad real de reportes, distribución por canal, posible causa, folios relacionados y referencia opcional a una incidencia maestra.

El cálculo semántico/geográfico pertenece al backend o servicio RAG. El frontend únicamente presenta el resultado y permite gestionarlo.
