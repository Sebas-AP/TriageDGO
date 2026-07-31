# Plan: Twilio Voice + Ngrok + Conversation Agent

## Objetivo

Habilitar que ciudadanos reporten problemas por llamada telefónica. El sistema contesta, entabla una conversación fluida guiada por el Supervisor (usando un nuevo agente `conversation`), recolecta descripción y ubicación, transcribe el audio con Whisper, procesa el reporte con los 6 agentes existentes, y envía acuse por WhatsApp. Al arrancar en dev, ngrok expone el puerto local y configura automáticamente el webhook de voz en Twilio.

---

## 1. Arquitectura General

```
┌──────────────────────────────────────────────────────────────────┐
│ index.ts (startup)                                                │
│   1. startNgrok(PORT) → URL pública                               │
│   2. configureTwilioVoiceWebhook(url) → Twilio API                │
│   3. createApp(deps) → Express con voice webhook montado          │
│   4. app.listen(PORT)                                             │
└──────────────────────────────────────────────────────────────────┘
                            │
┌──────────────────────────────────────────────────────────────────┐
│ voice.webhook.ts (presentation)                                   │
│   Router con 5 endpoints en /webhooks/voz:                        │
│   POST /           → inicio de llamada (greeting + record)        │
│   POST /descripcion → callback de grabación (Whisper transcribe)  │
│   POST /evaluar    → Supervisor decide próximo paso               │
│   POST /ubicacion  → recibe ubicación por voz (geocodifica)       │
│   POST /procesar   → enqueues report, acuse WhatsApp, dice folio │
│   POST /status     → callback de estado final de llamada          │
│                                                                   │
│   Usa: twiml.ts, ConversationService, TranscriptionService,       │
│        TwilioClient.obtenerGrabacion(), validateTwilioSignature   │
└──────────────────────────────────────────────────────────────────┘
                            │
┌──────────────────────────────────────────────────────────────────┐
│ conversation.service.ts (business)                                │
│   - crear/cargar/actualizar conversación en TriageStore           │
│   - agregarTurno(rol, texto)                                     │
│   - evaluarProximoPaso() → llama a Supervisor.conversationalEval  │
│   - geocodificarUbicacion(texto) → MapsClient                     │
│   - construirReporte() → ReportInput listo para enqueue           │
└──────────────────────────────────────────────────────────────────┘
                            │
┌──────────────────────────────────────────────────────────────────┐
│ supervisor.ts (MODIFICADO)                                        │
│   + conversationalEvaluate(state) → ConversationResult            │
│       → Invoca this.agents.conversation(state)                   │
│       → codex exec con conversation.md prompt                    │
│   process(report) → sin cambios                                   │
└──────────────────────────────────────────────────────────────────┘
                            │
┌──────────────────────────────────────────────────────────────────┐
│ cli.gateway.ts (MODIFICADO)                                       │
│   cliAgents: AgentGateway = {                                     │
│     classifier, pattern, acuse, evidence, dedup, escalation,      │
│     conversation: (state, trace) => invoke("conversation", ...)   │
│   }                                                               │
└──────────────────────────────────────────────────────────────────┘
                            │
┌──────────────────────────────────────────────────────────────────┐
│ agents/prompts/conversation.md (NUEVO) +                          │
│ agents/contracts/conversation.schema.json (NUEVO)                 │
│   Prompt multi-turno: recibe historial + datos recolectados,      │
│   decide si falta info, qué preguntar, o si ya está completo.     │
└──────────────────────────────────────────────────────────────────┘
```

### Diagrama de flujo de llamada

```
Ciudadano llama al número Twilio
         │
         ▼
   POST /webhooks/voz ─────────────────────────┐
   Validar firma                               │
   Crear conversación { etapa: "saludo" }      │
   TwiML: <Say> + <Record> ─────────────────────┤
         │                                      │
         ▼                                      │
   POST /webhooks/voz/descripcion               │
   Validar firma                               │
   Descargar audio (Twilio Basic Auth)          │
   Whisper transcribe                          │
   Guardar turno { rol:"ciudadano", texto }    │
   TwiML: <Redirect>/evaluar</Redirect> ────────┤
         │                                      │
         ▼                                      │
   POST /webhooks/voz/evaluar                   │
   Cargar conversación del store               │
   Supervisor.conversationalEvaluate(state)     │
     → codex exec conversation.md              │
     → ¿Listo para procesar?                   │
         │                                      │
    ┌────┴────┐                                │
    │ NO      │ SI                             │
    ▼         ▼                                │
  Falta      POST /webhooks/voz/procesar        │
  ubicación  Construir ReportInput              │
    │         Enqueue (canal:"voz")             │
    ▼         Worker → Supervisor.process()     │
  TwiML:     Crear ticket + acuse WhatsApp     │
  <Say>      TwiML: <Say>folio + <Hangup> ─────┘
  ¿Dónde?
  </Say>
  <Gather speech
   action="/ubicacion"
   language="es-MX"/>
    │
    ▼
  POST /webhooks/voz/ubicacion
  Guardar SpeechResult
  Geocodificar (Google Maps)
  Guardar coordenadas
  TwiML: <Redirect>/evaluar</Redirect> ──► vuelve a evaluar
```

---

## 2. Archivos — lista completa de cambios

### 2.1 Nuevos archivos (7)

| # | Archivo | Descripción resumida |
|---|---------|---------------------|
| 1 | `backend/src/presentation/twiml.ts` | Builder tipado de TwiML XML. Funciones puras: `twimlResponse()`, `say()`, `gatherSpeech()`, `record()`, `redirect()`, `hangup()`, `pause()`, `play()`. |
| 2 | `agents/prompts/conversation.md` | System prompt del agente de conversación. Recibe historial completo de turnos y datos recolectados. Decide: `preguntar_ubicacion`, `confirmar`, `pedir_aclaracion`, `procesar`. En español, máx 4 turnos antes de forzar procesamiento. |
| 3 | `agents/contracts/conversation.schema.json` | JSON Schema de salida: `{ accion, mensaje, datos_extraidos, datos_faltantes, listo_para_procesar, confianza }` |
| 4 | `backend/src/business/services/conversation.service.ts` | `ConversationService`: crear, cargar, agregarTurno, evaluarProximoPaso, geocodificarUbicacion, construirReporte, finalizar. Usa `Supervisor.conversationalEvaluate()`. |
| 5 | `backend/src/ngrok.ts` | `startNgrok(port) → Promise<string>` y `configureTwilioVoiceWebhook(baseUrl, client) → Promise<void>`. Usa npm package `@ngrok/ngrok`. |
| 6 | `backend/test/unit/twiml.test.ts` | ~10 tests: XML válido, atributos correctos en cada helper. |
| 7 | `backend/test/unit/voice.webhook.test.ts` | ~15 tests: firma inválida, flujo completo, transcripción fallida, geocodificación fallida, timeout. |

### 2.2 Archivos modificados (10)

| # | Archivo | Cambios |
|---|---------|---------|
| 8 | `backend/src/business/types.ts` | Agregar: `TurnoDialogo`, `EtapaConversacion`, `ConversationState`, `ConversationResult`. Agregar `conversation()` al `AgentGateway`. Agregar `guardarConversacion()`, `cargarConversacion()`, `actualizarConversacion()`, `cargarConversacionPorCallSid()` al `TriageStore`. |
| 9 | `backend/src/business/agents/cli.gateway.ts` | Agregar `conversation: (state, trace) => invoke("conversation", state, trace)` al objeto `cliAgents`. |
| 10 | `backend/src/business/orchestrator/supervisor.ts` | Agregar `conversationalEvaluate(state): Promise<ConversationResult>`. El método `process()` no se modifica. |
| 11 | `backend/src/mcp/clients/twilio.client.ts` | Agregar: `obtenerGrabacion()`, `obtenerIncomingPhoneNumbers()`, `actualizarVoiceWebhook()`, `enviarSms()`. |
| 12 | `backend/src/data/firestore/triage.store.ts` | InMemoryTriageStore: agregar `conversaciones = new Map()` y los 4 métodos. |
| 13 | `backend/src/data/firestore/firestore.store.ts` | FirestoreTriageStore: implementar los 4 métodos usando colección `conversaciones`. |
| 14 | `backend/src/presentation/voice.webhook.ts` | Reescribir completo. Router con 6 endpoints. Factory `createVoiceWebhook(deps)`. |
| 15 | `backend/src/app.ts` | Montar voice webhook en `/webhooks/voz`. Nuevas dependencias en `AppDependencies`. |
| 16 | `backend/src/index.ts` | Reescribir startup: ngrok → configurar webhooks Twilio → crear app → listen. |
| 17 | `.env.example` | Agregar: `NGROK_AUTHTOKEN=`, `NGROK_ENABLED=true`. |

### 2.3 Tests (3 nuevos)

| # | Archivo | Descripción |
|---|---------|-------------|
| 18 | `backend/test/unit/twiml.test.ts` | Tests del TwiML builder |
| 19 | `backend/test/unit/voice.webhook.test.ts` | Tests del voice webhook |
| 20 | `backend/test/unit/conversation.service.test.ts` | Tests del ConversationService con mock de AgentGateway |

---

## 3. Detalle de cada componente

### 3.1 TwiML Builder (`backend/src/presentation/twiml.ts`)

```typescript
interface SayOptions { voice?: string; language?: string; loop?: number; }
interface GatherOptions { input?: "speech" | "dtmf"; action: string; method?: "GET" | "POST"; timeout?: number; language?: string; hints?: string; }
interface RecordOptions { action: string; method?: "GET" | "POST"; maxLength?: number; playBeep?: boolean; transcribe?: boolean; timeout?: number; }

export function twimlResponse(...children: string[]): string;
export function say(text: string, opts?: SayOptions): string;
export function gatherSpeech(opts: GatherOptions, children?: string[]): string;
export function record(opts: RecordOptions): string;
export function redirect(url: string, method?: "GET" | "POST"): string;
export function hangup(): string;
export function pause(seconds: number): string;
export function play(url: string, loop?: number): string;
```

Cada función escapa el texto con `escapeXml()`. `twimlResponse` envuelve en `<?xml version="1.0" encoding="UTF-8"?><Response>...</Response>`.

### 3.2 Conversation Agent Prompt (`agents/prompts/conversation.md`)

```
Eres el agente de diálogo del sistema Triage 072. Tu función es mantener una
conversación fluida con un ciudadano que reporta un problema urbano.

Recibirás el historial completo de la conversación y los datos ya recolectados.
Debes decidir la próxima acción.

REGLAS:
1. Si NO hay descripción del problema → pide que lo describa.
2. Si hay descripción pero NO ubicación → pide la ubicación (calle, colonia, referencia).
3. Si hay descripción Y ubicación → confirma el resumen con el ciudadano.
4. Si el ciudadano confirma → indica que está listo para procesar.
5. Si el ciudadano corrige o aclara → actualiza los datos correspondientes.
6. Máximo 4 turnos totales. Si se excede → fuerza procesar con lo que haya.
7. Si el ciudadano quiere terminar → despedir.
8. Sé empático, breve (máx 2 oraciones), habla en español mexicano.
9. NUNCA inventes folios, tiempos de resolución ni promesas.
10. Si la descripción es muy vaga ("hay un problema"), pide más detalles.

Responde EXCLUSIVAMENTE con JSON válido según el schema.
```

### 3.3 Conversation Agent Schema (`agents/contracts/conversation.schema.json`)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "additionalProperties": false,
  "required": ["accion", "mensaje", "datos_extraidos", "datos_faltantes", "listo_para_procesar", "confianza"],
  "properties": {
    "accion": {
      "type": "string",
      "enum": ["preguntar_ubicacion", "confirmar", "pedir_aclaracion", "procesar", "despedir"]
    },
    "mensaje": {
      "type": "string",
      "description": "Texto EXACTO que se dirá al ciudadano por voz. Máximo 2 oraciones."
    },
    "datos_extraidos": {
      "type": "object",
      "properties": {
        "descripcion": { "type": "string" },
        "ubicacion_texto": { "type": "string" },
        "categoria_sugerida": { "type": "string" }
      }
    },
    "datos_faltantes": {
      "type": "array",
      "items": { "type": "string", "enum": ["ubicacion", "descripcion", "confirmacion"] }
    },
    "listo_para_procesar": { "type": "boolean" },
    "confianza": { "type": "number", "minimum": 0, "maximum": 1 }
  }
}
```

### 3.4 Voice Webhook (`backend/src/presentation/voice.webhook.ts`)

Interfaz de dependencias:

```typescript
export interface VoiceWebhookDeps {
  conversationService: ConversationService;
  transcription: TranscriptionService;
  twilioClient: TwilioClient;
  mapsClient: MapsClient;
  ingestionService: ReportIngestionService;
  authToken: string;
  publicBaseUrl: string;
  notificationService: AcuseSender;
}
```

Endpoints:

| Endpoint | Twilio trigger | Lógica |
|----------|---------------|--------|
| `POST /` | Incoming call | Valida firma. Extrae `CallSid`, `From`. `conversationService.crear(callSid, from)`. Responde `<Say>Bienvenido...</Say><Record action="/webhooks/voz/descripcion" maxLength="60"/>`. |
| `POST /descripcion` | Grabación lista | Descarga audio con `twilioClient.obtenerGrabacion()`. Transcribe con `transcription.transcribir()`. `conversationService.agregarTurno(callSid, "ciudadano", texto)`. `<Redirect>/webhooks/voz/evaluar</Redirect>`. |
| `POST /evaluar` | Redirect | Carga conversación. `conversationService.evaluarProximoPaso(callSid)`. Si `listo_para_procesar`: redirect a `/procesar`. Si no: `<Say>mensaje</Say><Gather input="speech" language="es-MX" action="/webhooks/voz/ubicacion"/>`. |
| `POST /ubicacion` | Speech result | Agrega turno. Geocodifica con `mapsClient.geocodificar()`. Guarda coordenadas. `<Redirect>/webhooks/voz/evaluar</Redirect>`. |
| `POST /procesar` | Redirect cuando listo | Construye `ReportInput`. `ingestionService.enqueue()`. Worker procesa. Acuse via WhatsApp. `<Say>Folio DUR-XXXX...</Say><Hangup/>`. |
| `POST /status` | Call status change | Actualiza etapa final. `<Response></Response>`. |

### 3.5 Conversation Service (`backend/src/business/services/conversation.service.ts`)

```typescript
export class ConversationService {
  constructor(
    private store: TriageStore,
    private agents: AgentGateway,
    private maps: MapsClient,
  ) {}

  async crear(callSid: string, telefono: string): Promise<ConversationState>;
  async cargar(callSid: string): Promise<ConversationState | undefined>;
  async agregarTurno(callSid: string, rol: "sistema" | "ciudadano", texto: string): Promise<void>;
  async evaluarProximoPaso(callSid: string): Promise<ConversationResult>;
  async guardarUbicacion(callSid: string, coordenadas: [number, number]): Promise<void>;
  async geocodificarUbicacion(texto: string): Promise<[number, number] | null>;
  construirReporte(callSid: string): Promise<ReportInput>;
  async finalizar(callSid: string): Promise<void>;
}
```

`evaluarProximoPaso()`:
1. Carga la conversación
2. Si ya tiene +4 turnos → fuerza `{ accion: "procesar", listo_para_procesar: true }`
3. Arma el payload para el agente: `{ turnos: [...], datos_actuales: {...} }`
4. Llama `this.agents.conversation(state)`
5. Si `listo_para_procesar` y hay coordenadas → ok
6. Si `listo_para_procesar` pero falta ubicación → cambia a `preguntar_ubicacion`
7. Guarda turno del sistema con el mensaje generado
8. Retorna `ConversationResult`

### 3.6 Ngrok Auto-Config (`backend/src/ngrok.ts`)

```typescript
import ngrok from "@ngrok/ngrok";
import type { TwilioClient } from "./mcp/clients/twilio.client";

export async function startNgrok(port: number): Promise<string> {
  if (process.env.NGROK_ENABLED !== "true") {
    console.log("Ngrok deshabilitado. Usando localhost.");
    return `http://localhost:${port}`;
  }
  const token = process.env.NGROK_AUTHTOKEN;
  if (!token) {
    console.warn("NGROK_ENABLED=true pero NGROK_AUTHTOKEN no definido. Usando localhost.");
    return `http://localhost:${port}`;
  }
  const listener = await ngrok.forward({
    addr: port,
    authtoken: token,
    proto: "http",
  });
  const url = listener.url();
  if (!url) throw new Error("Ngrok no devolvió URL");
  console.log(`Ngrok tunnel activo: ${url}`);
  return url;
}

export async function configureTwilioVoiceWebhook(
  baseUrl: string,
  client: TwilioClient,
): Promise<void> {
  // GET /2010-04-01/Accounts/{sid}/IncomingPhoneNumbers.json
  // Para cada número con capabilities.voice === true:
  //   POST /IncomingPhoneNumbers/{phoneSid}.json
  //   Body: VoiceUrl={baseUrl}/webhooks/voz
  //         StatusCallback={baseUrl}/webhooks/voz/status
  //         StatusCallbackMethod=POST
}
```

### 3.7 Twilio Client — nuevos métodos

```typescript
export interface TwilioClient {
  enviarWhatsapp(destino: string, mensaje: string): Promise<{ sid: string; estado: "enviado" | "simulado" }>;
  iniciarLlamada(destino: string, twimlUrl: string): Promise<{ sid: string; estado: "iniciada" | "simulada" }>;
  // NUEVOS:
  obtenerGrabacion(recordingUrl: string): Promise<{ bytes: Buffer; contentType: string }>;
  obtenerIncomingPhoneNumbers(): Promise<Array<{ sid: string; phoneNumber: string; voiceUrl?: string }>>;
  actualizarVoiceWebhook(phoneSid: string, voiceUrl: string, statusCallback: string): Promise<void>;
  enviarSms(destino: string, mensaje: string): Promise<{ sid: string; estado: "enviado" | "simulado" }>;
}
```

`obtenerGrabacion()` hace `fetch(recordingUrl, { headers: { authorization: "Basic " + base64(accountSid:authToken) } })`, retorna `response.arrayBuffer()` como Buffer y `content-type` como `audio/wav`.

### 3.8 Startup (`backend/src/index.ts`)

```typescript
import "dotenv/config";
import { startNgrok, configureTwilioVoiceWebhook } from "./ngrok";
import { createApp } from "./app";
import { createTwilioHttpClient, createUnavailableTwilioClient } from "./mcp/clients/twilio.client";
import { createGoogleMapsClient, createCatalogMapsClient } from "./mcp/clients/maps.client";
import { FirestoreTriageStore } from "./data/firestore/firestore.store";
import { InMemoryTriageStore } from "./data/firestore/triage.store";
import { createWhisperHttpClient, TranscriptionService, UnconfiguredWhisperClient } from "./business/services/transcription.service";
import { ReportIngestionService } from "./business/services/report-ingestion.service";
import { Supervisor } from "./business/orchestrator/supervisor";
import { cliAgents } from "./business/agents/cli.gateway";
import { geoService } from "./business/services/geo.service";
import { notificationService } from "./business/services/notification.service";

async function main() {
  const PORT = Number(process.env.PORT ?? 3000);

  // 1. Ngrok
  const publicBaseUrl = await startNgrok(PORT);

  // 2. Store
  const store = process.env.FIREBASE_PROJECT_ID
    ? new FirestoreTriageStore()
    : new InMemoryTriageStore();

  // 3. Twilio
  const twilioSid = process.env.TWILIO_ACCOUNT_SID;
  const twilioToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioClient = twilioSid && twilioToken
    ? createTwilioHttpClient(twilioSid, twilioToken, process.env.TWILIO_WHATSAPP_FROM ?? "")
    : createUnavailableTwilioClient();

  // 4. Auto-configurar webhook en Twilio
  if (publicBaseUrl.startsWith("https://")) {
    await configureTwilioVoiceWebhook(publicBaseUrl, twilioClient);
  }

  // 5. Maps
  const mapsClient = process.env.GOOGLE_MAPS_API_KEY
    ? createGoogleMapsClient(process.env.GOOGLE_MAPS_API_KEY)
    : createCatalogMapsClient([]);

  // 6. Whisper
  const whisperClient = process.env.WHISPER_API_KEY
    ? createWhisperHttpClient(process.env.WHISPER_API_KEY)
    : new UnconfiguredWhisperClient();
  const transcription = new TranscriptionService(whisperClient);

  // 7. Services
  const ingestionService = new ReportIngestionService(store);
  const supervisor = new Supervisor(store, cliAgents, geoService, notificationService);

  // 8. App
  const deps: AppDependencies = {
    store, transcription, twilioClient, mapsClient,
    ingestionService, supervisor,
    twilioAuthToken: twilioToken ?? "",
    publicBaseUrl,
    notificationService,
  };
  const app = createApp(deps);

  app.listen(PORT, () => {
    console.log(`Backend: http://localhost:${PORT}`);
    if (publicBaseUrl.startsWith("https://")) {
      console.log(`Público: ${publicBaseUrl}`);
      console.log(`Voice webhook: ${publicBaseUrl}/webhooks/voz`);
    }
  });
}

main().catch((err) => {
  console.error("Error al iniciar:", err);
  process.exit(1);
});
```

### 3.9 App Wiring (`backend/src/app.ts`)

```typescript
export interface AppDependencies {
  store: TriageStore;
  transcription: TranscriptionService;
  twilioClient: TwilioClient;
  mapsClient: MapsClient;
  ingestionService: ReportIngestionService;
  supervisor: Supervisor;
  twilioAuthToken: string;
  publicBaseUrl: string;
  notificationService: AcuseSender;
}

export function createApp(deps: AppDependencies): Express {
  // ...
  const conversationService = new ConversationService(deps.store, cliAgents, deps.mapsClient);
  app.use("/webhooks/voz", createVoiceWebhook({
    conversationService,
    transcription: deps.transcription,
    twilioClient: deps.twilioClient,
    mapsClient: deps.mapsClient,
    ingestionService: deps.ingestionService,
    authToken: deps.twilioAuthToken,
    publicBaseUrl: deps.publicBaseUrl,
    notificationService: deps.notificationService,
  }));
  // ...
}
```

### 3.10 Tipos a agregar en `business/types.ts`

```typescript
export interface TurnoDialogo {
  rol: "sistema" | "ciudadano";
  texto: string;
  timestamp: string;
}

export type EtapaConversacion =
  | "saludo"
  | "grabando"
  | "evaluando"
  | "pidiendo_ubicacion"
  | "confirmando"
  | "procesando"
  | "completada"
  | "cancelada";

export interface ConversationState {
  id: string;
  callSid: string;
  telefono: string;
  canal: "voz";
  etapa: EtapaConversacion;
  turnos: TurnoDialogo[];
  descripcion?: string;
  ubicacion_texto?: string;
  coordenadas?: [number, number];
  categoria_sugerida?: string;
  recordingSid?: string;
  reporte_id?: string;
  created_at: string;
  expira_en: string;
}

export interface ConversationResult {
  accion: "preguntar_ubicacion" | "confirmar" | "pedir_aclaracion" | "procesar" | "despedir";
  mensaje: string;
  datos_extraidos: {
    descripcion?: string;
    ubicacion_texto?: string;
    categoria_sugerida?: string;
  };
  datos_faltantes: Array<"ubicacion" | "descripcion" | "confirmacion">;
  listo_para_procesar: boolean;
  confianza: number;
}

// MODIFICAR AgentGateway
export interface AgentGateway {
  // ... existentes ...
  conversation(state: ConversationState, trace?: AgentTraceObserver): Promise<ConversationResult>;
}

// MODIFICAR TriageStore
export interface TriageStore {
  // ... existentes ...
  guardarConversacion(conv: ConversationState): Promise<void>;
  cargarConversacion(id: string): Promise<ConversationState | undefined>;
  cargarConversacionPorCallSid(callSid: string): Promise<ConversationState | undefined>;
  actualizarConversacion(id: string, update: Partial<Pick<ConversationState, "etapa" | "descripcion" | "ubicacion_texto" | "coordenadas" | "categoria_sugerida" | "reporte_id" | "turnos">>): Promise<void>;
}
```

---

## 4. Variables de entorno

```bash
# NUEVAS variables (el usuario las llena)
NGROK_AUTHTOKEN=              # token gratuito de https://dashboard.ngrok.com/get-started/your-authtoken
NGROK_ENABLED=true            # "true" para desarrollo local, "false" para producción

# Ya existentes — verificar que estén llenas
TWILIO_ACCOUNT_SID=           # de Twilio Console
TWILIO_AUTH_TOKEN=            # de Twilio Console
TWILIO_WHATSAPP_FROM=         # número WhatsApp sandbox (whatsapp:+1...)
WHISPER_API_KEY=              # API key de OpenAI para Whisper
GOOGLE_MAPS_API_KEY=          # para geocodificación de ubicaciones por voz
FIREBASE_PROJECT_ID=          # (ya configurado)
```

---

## 5. Dependencia npm nueva

```bash
cd backend && npm install @ngrok/ngrok
```

---

## 6. Orden de implementación

| Fase | Tarea | Archivos | Depende de |
|------|-------|----------|------------|
| **F1** | TwiML builder | `twiml.ts` + test | Nada |
| **F2** | Tipos de conversación | `business/types.ts` | Nada |
| **F3** | Prompt + schema | `conversation.md`, `conversation.schema.json` | Nada |
| **F4** | Métodos de conversación en data layer | `triage.store.ts`, `firestore.store.ts` | F2 |
| **F5** | Agregar `conversation` a `cli.gateway.ts` | `cli.gateway.ts` | F3 |
| **F6** | Agregar `conversationalEvaluate` a `supervisor.ts` | `supervisor.ts` | F5 |
| **F7** | Nuevos métodos en `twilio.client.ts` | `twilio.client.ts` | Nada |
| **F8** | `conversation.service.ts` | `conversation.service.ts` | F4, F6, F7 |
| **F9** | `voice.webhook.ts` | `voice.webhook.ts` | F1, F7, F8 |
| **F10** | `ngrok.ts` | `ngrok.ts` | F7 |
| **F11** | Wiring: `app.ts` + `index.ts` | `app.ts`, `index.ts` | F9, F10 |
| **F12** | `.env.example` | `.env.example` | Nada |
| **F13** | Tests | 3 archivos de test | F1, F8, F9 |
| **F14** | `npm install @ngrok/ngrok` | `package.json` | Nada |
| **F15** | `npm run lint` + `npm test` | Verificación | Todo |

Las fases F1, F2, F3, F7, F12, F14 pueden ejecutarse en paralelo (sin dependencias entre sí).

---

## 7. Manejo de errores y edge cases

| Caso | Comportamiento |
|------|---------------|
| Firma Twilio inválida | 403, sin procesar |
| CallSid duplicado (retry de Twilio) | Idempotencia: misma conversación, mismo TwiML |
| Whisper falla | `<Say>No entendí. Intenta de nuevo.</Say>` + `<Record>` |
| Google Maps falla | Catálogo local como fallback. Si no hay match: pedir otra referencia |
| Agente conversation timeout | Fuerza procesar con lo que se tenga |
| 4+ turnos sin completar | Fuerza procesar. Si falta ubicación: `revision_manual` |
| Ciudadano cuelga | Twilio envía `CallStatus=completed` → `/status` marca etapa final |
| Ngrok no disponible (sin token) | Usa localhost, loguea warning |
| Sin credenciales Twilio | `createUnavailableTwilioClient()` → stubs que loguean |
| Sin credenciales Whisper | `UnconfiguredWhisperClient` lanza error → se captura, se pide repetir |

---

## 8. Verificación manual (smoke test)

```bash
# 1. Llenar .env con credenciales reales
# 2. Iniciar
cd backend && npm run dev

# Debe mostrar:
# Ngrok tunnel activo: https://xxxx.ngrok.io
# Voice webhook configurado en Twilio para +52...
# Backend: http://localhost:3000
# Público: https://xxxx.ngrok.io

# 3. Llamar al número Twilio desde un teléfono real
# 4. Verificar en logs: transcripción, evaluación del agente, ticket creado
# 5. Verificar que llega WhatsApp con el acuse
```
