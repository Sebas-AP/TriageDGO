# Variables de entorno — Sistema de Triage 072

Todas las variables se cargan desde `.env` en la raíz del proyecto.
Ver `.env.example` para una plantilla completa.

## Firebase (backend)

Usadas por `firebase-admin` en el backend.

| Variable | Descripción | Requerida |
|---|---|---|
| `FIREBASE_PROJECT_ID` | ID del proyecto Firebase | Sí (producción) |
| `FIREBASE_CLIENT_EMAIL` | Email de la service account | Sí (producción) |
| `FIREBASE_PRIVATE_KEY` | Llave privada (con saltos de línea escapados) | Sí (producción) |
| `FIREBASE_STORAGE_BUCKET` | Bucket de Storage (ej. `my-project.appspot.com`) | Sí (producción) |

Sin estas variables, el backend usa `InMemoryTriageStore` (solo desarrollo).

## Firebase (frontend)

Usadas por el SDK cliente de Firebase en el navegador.

| Variable | Descripción | Requerida |
|---|---|---|
| `VITE_FIREBASE_API_KEY` | API key del proyecto web | Sí (modo API) |
| `VITE_FIREBASE_AUTH_DOMAIN` | Dominio de Auth (ej. `my-project.firebaseapp.com`) | Sí (modo API) |
| `VITE_FIREBASE_PROJECT_ID` | ID del proyecto | Sí (modo API) |
| `VITE_FIREBASE_STORAGE_BUCKET` | Bucket de Storage | Sí (modo API) |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Sender ID de messaging | Sí (modo API) |
| `VITE_FIREBASE_APP_ID` | App ID del proyecto web | Sí (modo API) |

En modo demo (`VITE_APP_MODE=demo`) estas variables no son necesarias.

## Twilio

Usadas por el webhook de WhatsApp y el servicio de notificaciones.

| Variable | Descripción | Requerida |
|---|---|---|
| `TWILIO_ACCOUNT_SID` | Account SID de Twilio | Sí (WhatsApp/voz) |
| `TWILIO_AUTH_TOKEN` | Auth token (para validar firmas de webhook) | Sí (WhatsApp/voz) |
| `TWILIO_WHATSAPP_FROM` | Número de WhatsApp (ej. `whatsapp:+14155238886`) | Sí (acuses) |

Sin estas variables, los acuses se registran en consola pero no se envían.

## Google Maps

Usadas por el MCP Google Maps (geocodificación, lugares cercanos).

| Variable | Descripción | Requerida |
|---|---|---|
| `GOOGLE_MAPS_API_KEY` | API key de Google Maps Platform | Sí (mapas) |

Sin esta variable, el sistema usa el catálogo local de escuelas como fallback.

## Whisper API

Usadas para transcripción de audio (notas de voz, llamadas).

| Variable | Descripción | Requerida |
|---|---|---|
| `WHISPER_API_KEY` | API key de OpenAI (Whisper) | Sí (transcripción) |

Sin esta variable, `TranscriptionService` lanza error al intentar transcribir.

## Microservicio RAG

Usadas por el backend para comunicarse con el servicio RAG.

| Variable | Descripción | Default |
|---|---|---|
| `RAG_SERVICE_URL` | URL base del servicio RAG | `http://localhost:8001` |
| `RAG_INTERNAL_TOKEN` | Token para endpoints de indexación | — |
| `RAG_INDEX_DIR` | Directorio del índice vectorial | `./.rag-index` |
| `RAG_MIN_SIMILARITY` | Umbral mínimo de similitud | `0.55` |
| `RAG_TIMEOUT_SECONDS` | Timeout de requests al RAG | `5` |
| `RAG_RECONCILE_SECONDS` | Intervalo de reconciliación del índice | `300` |

## Codex (agentes IA)

Usadas por `cli.gateway.ts` para invocar los agentes de razonamiento.

| Variable | Descripción | Default |
|---|---|---|
| `CODEX_BIN` | Ruta al binario `codex` | `codex` |
| `CODEX_MODEL` | Modelo a usar | `gpt-5.6-luna` |
| `MCP_REPORTES_CONFIG` | Ruta al config MCP de reportes | `../services/mcp-reportes/mcp.json` |

## Backend Express

| Variable | Descripción | Default |
|---|---|---|
| `PORT` | Puerto del servidor HTTP | `3000` |
| `CORS_ALLOWED_ORIGINS` | Orígenes permitidos (separados por coma) | `http://localhost:5173` |
| `WORKER_POLL_MS` | Intervalo de polling del worker (ms) | `2000` |
| `SCHOOLS_PATH` | Ruta al catálogo de escuelas | `../assets/escuelas.json` |

## Frontend

| Variable | Descripción | Default |
|---|---|---|
| `VITE_APP_MODE` | Modo de operación (`demo` o `api`) | `demo` |
| `VITE_API_BASE_URL` | URL base del backend | `http://localhost:3000` |
| `VITE_MAX_PHOTO_MB` | Tamaño máximo de foto en MB | `5` |

## Configuración mínima para desarrollo

Para desarrollo local sin servicios externos:

```bash
# .env (raíz)
PORT=3000
CORS_ALLOWED_ORIGINS=http://localhost:5173
RAG_SERVICE_URL=http://localhost:8001
WORKER_POLL_MS=2000
CODEX_BIN=codex
CODEX_MODEL=gpt-5.6-luna
```

```bash
# frontend/.env
VITE_APP_MODE=demo
```

Esto usa `InMemoryTriageStore`, modo demo en frontend, y no requiere
Firebase, Twilio, Google Maps ni Whisper.
