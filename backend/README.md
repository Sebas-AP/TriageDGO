# Backend — Sistema de Triage 072

Monolito Express + TypeScript que implementa la capa de negocio del sistema
de triage. Arquitectura en 3 capas: presentación, negocio y datos.

## Scripts

```bash
npm run dev       # Desarrollo con ts-node-dev (hot reload)
npm run worker    # Worker de procesamiento asíncrono
npm run build     # Compilar TypeScript a dist/
npm start         # Ejecutar dist/index.js (producción)
npm test          # Vitest
npm run lint      # TypeScript type-check (tsc --noEmit)
```

## Estructura

```
src/
├── app.ts                    # Configuración de Express y rutas
├── index.ts                  # Entry point del servidor HTTP
├── worker.ts                 # Entry point del worker asíncrono
├── env.ts                    # Carga de variables de entorno
│
├── presentation/             # Capa de presentación (HTTP)
│   ├── ingestion.controller.ts    # POST /reportes/ingesta (multicanal)
│   ├── report.controller.ts       # GET /reportes/:id (estatus público)
│   ├── admin.controller.ts        # Consola admin (listado, detalle)
│   ├── whatsapp.webhook.ts        # Webhook Twilio WhatsApp
│   ├── voice.webhook.ts           # Webhook Twilio Voice (stub)
│   ├── auth.middleware.ts         # Autenticación Firebase
│   └── schemas.ts                 # Validación Zod
│
├── business/                 # Capa de negocio
│   ├── types.ts                   # Tipos de dominio (Report, Ticket, etc.)
│   ├── worker.ts                  # IngestionWorker (claim + process)
│   ├── orchestrator/
│   │   └── supervisor.ts          # Orquestación de agentes en paralelo
│   ├── agents/
│   │   └── cli.gateway.ts         # Invocación de codex exec por agente
│   ├── rules/
│   │   ├── arbitration.rules.ts   # Reglas de arbitraje (P0-P3)
│   │   └── priority.rules.ts      # Mapeo urgencia → prioridad
│   └── services/
│       ├── report-ingestion.service.ts  # Servicio de ingesta
│       ├── report-query.service.ts      # Consulta de reportes
│       ├── geo.service.ts               # Geolocalización (escuelas, clima)
│       ├── notification.service.ts      # Envío de acuses (Twilio)
│       ├── transcription.service.ts     # Transcripción Whisper
│       └── cost.service.ts              # Estimación de costos
│
├── data/                     # Capa de datos
│   ├── firestore/
│   │   ├── firebase.ts            # Inicialización Firebase Admin
│   │   ├── firestore.store.ts     # TriageStore sobre Firestore
│   │   ├── triage.store.ts        # TriageStore en memoria (dev)
│   │   ├── reports.repo.ts        # Repositorio de reportes
│   │   ├── tickets.repo.ts        # Repositorio de tickets
│   │   ├── users.repo.ts          # Repositorio de usuarios
│   │   └── predial.repo.ts        # Repositorio de predial
│   ├── storage/
│   │   └── evidence.repo.ts       # Firebase Storage (evidencias)
│   └── seed-emulator.ts           # Datos de prueba para emuladores
│
└── mcp/                      # Model Context Protocol
    ├── server/
    │   ├── reportes.server.ts     # MCP Reportes (buscar_similares, etc.)
    │   ├── twilio.server.ts       # MCP Twilio (WhatsApp, voz)
    │   └── maps.server.ts         # MCP Google Maps
    ├── clients/
    │   ├── rag.client.ts          # Cliente HTTP del servicio RAG
    │   ├── maps.client.ts         # Cliente Google Maps
    │   └── twilio.client.ts       # Cliente Twilio
    └── tools/
        ├── buscar-similares.tool.ts
        ├── crear-ticket.tool.ts
        ├── enviar-acuse.tool.ts
        ├── maps.tools.ts
        └── recibir-grabacion.tool.ts
```

## Flujo de ingesta

```
Canal (form/whatsapp/llamada)
    ↓
ingestion.controller.ts (validación + normalización)
    ↓
ReportIngestionService.enqueue()
    ↓
TriageStore.enqueue() → Report + IngestionJob
    ↓
Worker (polling cada WORKER_POLL_MS)
    ↓
IngestionWorker.runOnce() → claimJob()
    ↓
Supervisor.process()
    ↓
Promise.allSettled([classifier, pattern, acuse, dedup, evidence?])
    ↓
Reglas de arbitraje → Ticket
    ↓
TriageStore.completeJob() + RAG indexing
```

## Stores

El backend soporta dos implementaciones de `TriageStore`:

- **InMemoryTriageStore**: desarrollo local sin Firebase
- **FirestoreTriageStore**: producción con Firebase Firestore

La selección es automática según la presencia de `FIREBASE_PROJECT_ID`.

## Dependencias principales

| Paquete | Uso |
|---|---|
| `express` | Framework HTTP |
| `firebase-admin` | SDK de Firebase (Firestore, Storage, Auth) |
| `zod` | Validación de schemas |
| `multer` | Upload de archivos (evidencias) |
| `@modelcontextprotocol/sdk` | Servidores MCP |
| `cors` | Cross-origin requests |
| `dotenv` | Variables de entorno |

## Testing

```bash
npm test              # Ejecutar todos los tests
npm run test:watch    # Modo watch
```

Los tests usan Vitest y se encuentran en `backend/test/`.
