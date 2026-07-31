# Wiring mínimo de endpoints HTTP (Triage 072 backend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar de alta el wiring HTTP mínimo del monolito Express (`backend/`) — `POST /reportes/ingesta`, `POST /webhooks/whatsapp`, `POST /webhooks/voz` (+ `/grabacion`), y una consola admin de solo lectura (`GET /admin/reportes`) — para que el sistema tenga endpoints reales que se puedan probar con `curl`, sin tocar la orquestación multiagente (`business/orchestrator`, `business/agents/*.agent.ts`), que permanece fuera de alcance.

**Architecture:** Cada controller/webhook es una factory function (`createXController(deps): Router`) que recibe sus dependencias inyectadas (repos, servicios) — mismo patrón que ya usan `data/firestore/*.repo.ts` y `mcp/clients/*.client.ts` (`createXRepository(db)`, `createXClient(...)`). Un módulo nuevo `src/app.ts` ensambla los routers en un `Express` sin tocar Firebase; `src/index.ts` es el único lugar que inicializa Firebase Admin (real o contra el emulador) y arranca el servidor. Esto permite testear cada controller con `supertest` inyectando un repo falso en memoria, sin depender del emulador de Firestore.

**Tech Stack:** Express 4.22, TypeScript 5.6 (strict), Zod 4 para validación de entrada, Vitest 2 + Supertest para tests HTTP, Firebase Admin SDK (Firestore) vía el emulador local (`firebase.json` ya existe en la raíz del repo).

## Global Constraints

- No modificar `business/orchestrator/supervisor.ts` ni `business/agents/*.agent.ts` — siguen en fase TDD, fuera de alcance de este plan.
- No modificar `business/rules/*.rules.ts` — igual, fuera de alcance.
- Todo controller/webhook se construye como `createX(deps): Router`, nunca como router con dependencias importadas directamente (permite inyectar fakes en tests).
- Construcción de comandos/queries sin concatenación insegura; body de Twilio siempre se valida con `validateTwilioSignature` (ya existe en `src/mcp/clients/twilio.client.ts`) antes de tocar Firestore.
- Estilo del repo: TS denso, sin comentarios explicativos de "qué hace" (solo el porqué si es no obvio), factory functions, interfaces explícitas — replicar el estilo ya visto en `reports.repo.ts` / `tickets.repo.ts` / `twilio.client.ts`.
- Todos los archivos nuevos bajo `backend/src/` y `backend/test/unit/`.

---

### Task 1: Dependencia de test (`supertest`) + fake `ReportsRepository`

**Files:**
- Modify: `backend/package.json`
- Create: `backend/test/helpers/fake-reports-repo.ts`

**Interfaces:**
- Produces: `createFakeReportsRepository(): ReportsRepository` — usado por los tests de las Tasks 3, 4, 5, 6.

- [ ] **Step 1: Instalar `supertest` y sus tipos**

```bash
cd "backend" && npm install --save-dev supertest @types/supertest
```

- [ ] **Step 2: Crear el fake repo en memoria**

```typescript
// backend/test/helpers/fake-reports-repo.ts
import {
  ReporteNoEncontradoError,
  type NuevoReporte,
  type Reporte,
  type ReportsRepository,
} from "../../src/data/firestore/reports.repo";

export function createFakeReportsRepository(): ReportsRepository {
  const store = new Map<string, Reporte>();
  let seq = 0;

  return {
    async crear(datos: NuevoReporte) {
      const id = `FAKE-${++seq}`;
      const reporte: Reporte = {
        id,
        ciudadanoId: datos.ciudadanoId,
        canal: datos.canal,
        texto: datos.texto,
        coordenadas: datos.coordenadas,
        colonia: datos.colonia,
        categoria: datos.categoria,
        estado: "abierto",
        ticketId: null,
        creadoEn: new Date().toISOString(),
      };
      store.set(id, reporte);
      return reporte;
    },
    async leerPorId(id) {
      return store.get(id) ?? null;
    },
    async listarPorCiudadano(ciudadanoId) {
      return [...store.values()].filter((reporte) => reporte.ciudadanoId === ciudadanoId);
    },
    async listarRecientes(limite) {
      return [...store.values()]
        .sort((a, b) => b.creadoEn.localeCompare(a.creadoEn))
        .slice(0, limite);
    },
    async actualizarEstado(id, estado, ticketId) {
      const found = store.get(id);
      if (!found) throw new ReporteNoEncontradoError(id);
      const actualizado = { ...found, estado, ...(ticketId !== undefined ? { ticketId } : {}) };
      store.set(id, actualizado);
      return actualizado;
    },
  };
}
```

This won't compile yet — `ReportsRepository` doesn't have `listarRecientes` until Task 4. That's expected; Task 4 adds it. `npx vitest run` uses esbuild (transpile-only) so this doesn't block Task 1-3 test runs; only `npm run lint` (`tsc --noEmit`) would fail until Task 4 lands — don't run lint before then.

- [ ] **Step 3: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/test/helpers/fake-reports-repo.ts
git commit -m "test: add supertest and in-memory fake ReportsRepository"
```

---

### Task 2: `presentation/schemas.ts` — validación Zod de `NuevoReporte`

**Files:**
- Create: `backend/src/presentation/schemas.ts`
- Test: `backend/test/unit/schemas.test.ts`

**Interfaces:**
- Produces: `NuevoReporteSchema: ZodType`, `type NuevoReporteInput` — consumidos por Task 3 (`report.controller.ts`) y Task 5/6 (webhooks).

- [ ] **Step 1: Write the failing test**

```typescript
// backend/test/unit/schemas.test.ts
import { describe, expect, it } from "vitest";

import { NuevoReporteSchema } from "../../src/presentation/schemas";

describe("NuevoReporteSchema", () => {
  it("acepta un reporte válido", () => {
    const result = NuevoReporteSchema.safeParse({
      ciudadanoId: "ciudadano-1",
      canal: "formulario",
      texto: "Bache grande en la calle Hidalgo",
      coordenadas: [24.02, -104.67],
    });
    expect(result.success).toBe(true);
  });

  it("rechaza coordenadas fuera de rango", () => {
    const result = NuevoReporteSchema.safeParse({
      ciudadanoId: "ciudadano-1",
      canal: "formulario",
      texto: "Bache",
      coordenadas: [200, -104.67],
    });
    expect(result.success).toBe(false);
  });

  it("rechaza un canal no reconocido", () => {
    const result = NuevoReporteSchema.safeParse({
      ciudadanoId: "ciudadano-1",
      canal: "telegrama",
      texto: "Bache",
      coordenadas: [24.02, -104.67],
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run test/unit/schemas.test.ts`
Expected: FAIL — `Cannot find module '../../src/presentation/schemas'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// backend/src/presentation/schemas.ts
import { z } from "zod";

export const CoordenadasSchema = z.tuple([
  z.number().min(-90).max(90),
  z.number().min(-180).max(180),
]);

export const NuevoReporteSchema = z.object({
  ciudadanoId: z.string().min(1),
  canal: z.enum(["formulario", "whatsapp", "llamada"]),
  texto: z.string().min(1),
  coordenadas: CoordenadasSchema,
  colonia: z.string().min(1).optional(),
  categoria: z.string().min(1).optional(),
});

export type NuevoReporteInput = z.infer<typeof NuevoReporteSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run test/unit/schemas.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/presentation/schemas.ts backend/test/unit/schemas.test.ts
git commit -m "feat: add NuevoReporte validation schema"
```

---

### Task 3: `report.controller.ts` — `POST /reportes/ingesta`

**Files:**
- Create: `backend/src/presentation/report.controller.ts`
- Test: `backend/test/unit/report.controller.test.ts`

**Interfaces:**
- Consumes: `ReportsRepository.crear(datos: NuevoReporte): Promise<Reporte>` (`src/data/firestore/reports.repo.ts`), `NuevoReporteSchema` (Task 2).
- Produces: `createReportController(reports: ReportsRepository): Router` — montado por Task 7 en `/reportes/ingesta`.

- [ ] **Step 1: Write the failing test**

```typescript
// backend/test/unit/report.controller.test.ts
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { createReportController } from "../../src/presentation/report.controller";
import { createFakeReportsRepository } from "../helpers/fake-reports-repo";

function buildApp() {
  const reports = createFakeReportsRepository();
  const app = express();
  app.use(express.json());
  app.use("/reportes/ingesta", createReportController(reports));
  return { app, reports };
}

describe("POST /reportes/ingesta", () => {
  it("crea un reporte y devuelve 201 con folio", async () => {
    const { app } = buildApp();
    const response = await request(app)
      .post("/reportes/ingesta")
      .send({
        ciudadanoId: "ciudadano-1",
        canal: "formulario",
        texto: "Bache en Hidalgo esquina Zaragoza",
        coordenadas: [24.02, -104.67],
      });

    expect(response.status).toBe(201);
    expect(response.body.estado).toBe("abierto");
    expect(typeof response.body.reporte_id).toBe("string");
  });

  it("rechaza un body inválido con 400", async () => {
    const { app } = buildApp();
    const response = await request(app).post("/reportes/ingesta").send({ texto: "sin lo demás" });

    expect(response.status).toBe(400);
    expect(response.body.error).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run test/unit/report.controller.test.ts`
Expected: FAIL — `Cannot find module '../../src/presentation/report.controller'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// backend/src/presentation/report.controller.ts
import { Router } from "express";

import type { ReportsRepository } from "../data/firestore/reports.repo";
import { NuevoReporteSchema } from "./schemas";

export function createReportController(reports: ReportsRepository): Router {
  const router = Router();

  router.post("/", async (req, res) => {
    const parsed = NuevoReporteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Reporte inválido.", detalles: parsed.error.flatten() });
      return;
    }
    const reporte = await reports.crear(parsed.data);
    res.status(201).json({ reporte_id: reporte.id, folio: reporte.id, estado: reporte.estado });
  });

  return router;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run test/unit/report.controller.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/presentation/report.controller.ts backend/test/unit/report.controller.test.ts
git commit -m "feat: wire POST /reportes/ingesta"
```

---

### Task 4: `listarRecientes` en `reports.repo.ts` + `admin.controller.ts`

**Files:**
- Modify: `backend/src/data/firestore/reports.repo.ts`
- Modify: `backend/test/helpers/fake-reports-repo.ts` (ya implementa `listarRecientes` desde Task 1 — este task lo vuelve válido en TS)
- Create: `backend/src/presentation/admin.controller.ts`
- Test: `backend/test/unit/admin.controller.test.ts`

**Interfaces:**
- Consumes: `ReportsRepository` extendido con `listarRecientes(limite: number): Promise<Reporte[]>`.
- Produces: `createAdminController(reports: ReportsRepository): Router` — montado por Task 7 en `/admin`.

- [ ] **Step 1: Write the failing test**

```typescript
// backend/test/unit/admin.controller.test.ts
import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { createAdminController } from "../../src/presentation/admin.controller";
import { createFakeReportsRepository } from "../helpers/fake-reports-repo";

function buildApp() {
  const reports = createFakeReportsRepository();
  const app = express();
  app.use(express.json());
  app.use("/admin", createAdminController(reports));
  return { app, reports };
}

describe("GET /admin/reportes", () => {
  it("lista los reportes recientes", async () => {
    const { app, reports } = buildApp();
    await reports.crear({
      ciudadanoId: "c1",
      canal: "formulario",
      texto: "Fuga de agua",
      coordenadas: [24.0, -104.0],
    });

    const response = await request(app).get("/admin/reportes");

    expect(response.status).toBe(200);
    expect(response.body.reportes).toHaveLength(1);
    expect(response.body.reportes[0].texto).toBe("Fuga de agua");
  });

  it("devuelve 404 si el reporte no existe", async () => {
    const { app } = buildApp();
    const response = await request(app).get("/admin/reportes/no-existe");
    expect(response.status).toBe(404);
  });

  it("devuelve un reporte por id", async () => {
    const { app, reports } = buildApp();
    const creado = await reports.crear({
      ciudadanoId: "c1",
      canal: "formulario",
      texto: "Cable caído",
      coordenadas: [24.0, -104.0],
    });

    const response = await request(app).get(`/admin/reportes/${creado.id}`);

    expect(response.status).toBe(200);
    expect(response.body.id).toBe(creado.id);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run test/unit/admin.controller.test.ts`
Expected: FAIL — `Cannot find module '../../src/presentation/admin.controller'`

- [ ] **Step 3: Extend the repository interface and Firestore implementation**

In `backend/src/data/firestore/reports.repo.ts`, add `listarRecientes` to the `ReportsRepository` interface:

```typescript
export interface ReportsRepository {
  crear(datos: NuevoReporte): Promise<Reporte>;
  leerPorId(id: string): Promise<Reporte | null>;
  listarPorCiudadano(ciudadanoId: string): Promise<Reporte[]>;
  listarRecientes(limite: number): Promise<Reporte[]>;
  actualizarEstado(id: string, estado: EstadoReporte, ticketId?: string): Promise<Reporte>;
}
```

And add the implementation inside `createReportsRepository`, alongside the other methods (after `listarPorCiudadano`):

```typescript
    async listarRecientes(limite) {
      const snap = await coleccion.orderBy("creadoEn", "desc").limit(limite).get();
      return snap.docs.map((doc) => toReporte(doc.id, doc.data()));
    },
```

- [ ] **Step 4: Write the controller**

```typescript
// backend/src/presentation/admin.controller.ts
import { Router } from "express";

import type { ReportsRepository } from "../data/firestore/reports.repo";

export function createAdminController(reports: ReportsRepository): Router {
  const router = Router();

  router.get("/reportes", async (req, res) => {
    const solicitado = Number(req.query.limite ?? 50);
    const limite = Number.isFinite(solicitado) && solicitado > 0 ? Math.min(solicitado, 200) : 50;
    const lista = await reports.listarRecientes(limite);
    res.status(200).json({ reportes: lista });
  });

  router.get("/reportes/:id", async (req, res) => {
    const reporte = await reports.leerPorId(req.params.id);
    if (!reporte) {
      res.status(404).json({ error: "Reporte no encontrado." });
      return;
    }
    res.status(200).json(reporte);
  });

  return router;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && npx vitest run test/unit/admin.controller.test.ts backend/test/unit/report.controller.test.ts`
Expected: PASS (all tests, including Task 3's, which now compile against the extended interface)

- [ ] **Step 6: Commit**

```bash
git add backend/src/data/firestore/reports.repo.ts backend/src/presentation/admin.controller.ts backend/test/unit/admin.controller.test.ts
git commit -m "feat: add GET /admin/reportes bandeja endpoint"
```

---

### Task 5: `whatsapp.webhook.ts` — `POST /webhooks/whatsapp`

**Files:**
- Create: `backend/src/presentation/whatsapp.webhook.ts`
- Test: `backend/test/unit/whatsapp.webhook.test.ts`

**Interfaces:**
- Consumes: `validateTwilioSignature` (`src/mcp/clients/twilio.client.ts`), `ReportsRepository.crear`, `TranscriptionService.transcribir` (`src/business/services/transcription.service.ts`).
- Produces: `createWhatsappWebhook(deps: WhatsappWebhookDeps): Router` — montado por Task 7 en `/webhooks/whatsapp`.

- [ ] **Step 1: Write the failing test**

```typescript
// backend/test/unit/whatsapp.webhook.test.ts
import { createHmac } from "node:crypto";

import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { TranscriptionService, type WhisperClient } from "../../src/business/services/transcription.service";
import { createWhatsappWebhook } from "../../src/presentation/whatsapp.webhook";
import { createFakeReportsRepository } from "../helpers/fake-reports-repo";

const AUTH_TOKEN = "test-auth-token";
const BASE_URL = "http://localhost:3000";

function firmar(url: string, params: Record<string, string>): string {
  const body = Object.keys(params)
    .sort()
    .reduce((current, key) => current + key + params[key], url);
  return createHmac("sha1", AUTH_TOKEN).update(body).digest("base64");
}

function buildApp(whisper: WhisperClient = { transcribir: async () => ({ texto: "" }) }) {
  const reports = createFakeReportsRepository();
  const transcription = new TranscriptionService(whisper);
  const app = express();
  app.use(
    "/webhooks/whatsapp",
    createWhatsappWebhook({
      reports,
      transcription,
      authToken: AUTH_TOKEN,
      publicBaseUrl: BASE_URL,
    }),
  );
  return { app, reports };
}

describe("POST /webhooks/whatsapp", () => {
  it("rechaza firmas inválidas con 403", async () => {
    const { app } = buildApp();
    const response = await request(app)
      .post("/webhooks/whatsapp")
      .set("x-twilio-signature", "firma-invalida")
      .type("form")
      .send({ From: "whatsapp:+5216180000000", Body: "hola" });

    expect(response.status).toBe(403);
  });

  it("crea un reporte a partir de un mensaje de texto válido", async () => {
    const { app, reports } = buildApp();
    const params = { From: "whatsapp:+5216180000000", Body: "Hay un bache enorme", NumMedia: "0" };
    const signature = firmar(`${BASE_URL}/webhooks/whatsapp`, params);

    const response = await request(app)
      .post("/webhooks/whatsapp")
      .set("x-twilio-signature", signature)
      .type("form")
      .send(params);

    expect(response.status).toBe(200);
    const creados = await reports.listarPorCiudadano("whatsapp:+5216180000000");
    expect(creados).toHaveLength(1);
    expect(creados[0].texto).toBe("Hay un bache enorme");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run test/unit/whatsapp.webhook.test.ts`
Expected: FAIL — `Cannot find module '../../src/presentation/whatsapp.webhook'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// backend/src/presentation/whatsapp.webhook.ts
import express, { Router } from "express";

import type { ReportsRepository } from "../data/firestore/reports.repo";
import type { TranscriptionService } from "../business/services/transcription.service";
import { validateTwilioSignature } from "../mcp/clients/twilio.client";

export interface WhatsappWebhookDeps {
  reports: ReportsRepository;
  transcription: TranscriptionService;
  authToken: string;
  publicBaseUrl: string;
  descargarMedia?: (url: string) => Promise<{ bytes: Buffer; contentType: string }>;
}

const EMPTY_TWIML = `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;

export function createWhatsappWebhook(deps: WhatsappWebhookDeps): Router {
  const router = Router();
  router.use(express.urlencoded({ extended: false }));

  router.post("/", async (req, res) => {
    const signature = req.header("x-twilio-signature") ?? "";
    const url = `${deps.publicBaseUrl}${req.originalUrl}`;
    const valido = validateTwilioSignature({
      authToken: deps.authToken,
      url,
      parameters: req.body as Record<string, string>,
      signature,
    });
    if (!valido) {
      res.status(403).send("Firma inválida.");
      return;
    }

    const from = req.body.From as string | undefined;
    if (!from) {
      res.status(400).send("Falta remitente.");
      return;
    }

    let texto = (req.body.Body as string | undefined) ?? "";
    const numMedia = Number(req.body.NumMedia ?? "0");
    const contentType = (req.body.MediaContentType0 as string | undefined) ?? "";
    if (numMedia > 0 && deps.descargarMedia && contentType.startsWith("audio/")) {
      const { bytes } = await deps.descargarMedia(req.body.MediaUrl0 as string);
      const transcrito = await deps.transcription.transcribir(bytes, "whatsapp-audio", contentType);
      texto = transcrito.texto;
    }

    if (!texto) {
      res.status(400).send("Reporte sin contenido.");
      return;
    }

    await deps.reports.crear({ ciudadanoId: from, canal: "whatsapp", texto, coordenadas: [0, 0] });
    res.status(200).type("text/xml").send(EMPTY_TWIML);
  });

  return router;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run test/unit/whatsapp.webhook.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/presentation/whatsapp.webhook.ts backend/test/unit/whatsapp.webhook.test.ts
git commit -m "feat: wire POST /webhooks/whatsapp"
```

---

### Task 6: `voice.webhook.ts` — `POST /webhooks/voz` + `POST /webhooks/voz/grabacion`

**Files:**
- Create: `backend/src/presentation/voice.webhook.ts`
- Test: `backend/test/unit/voice.webhook.test.ts`

**Interfaces:**
- Consumes: `validateTwilioSignature`, `parseRecordingPayload` (`src/mcp/tools/recibir-grabacion.tool.ts`), `ReportsRepository.crear`, `TranscriptionService.transcribir`.
- Produces: `createVoiceWebhook(deps: VoiceWebhookDeps): Router` — montado por Task 7 en `/webhooks/voz`.

- [ ] **Step 1: Write the failing test**

```typescript
// backend/test/unit/voice.webhook.test.ts
import { createHmac } from "node:crypto";

import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { TranscriptionService, type WhisperClient } from "../../src/business/services/transcription.service";
import { createVoiceWebhook } from "../../src/presentation/voice.webhook";
import { createFakeReportsRepository } from "../helpers/fake-reports-repo";

const AUTH_TOKEN = "test-auth-token";
const BASE_URL = "http://localhost:3000";

function firmar(url: string, params: Record<string, string>): string {
  const body = Object.keys(params)
    .sort()
    .reduce((current, key) => current + key + params[key], url);
  return createHmac("sha1", AUTH_TOKEN).update(body).digest("base64");
}

function buildApp() {
  const reports = createFakeReportsRepository();
  const whisper: WhisperClient = { transcribir: async () => ({ texto: "Hay un poste caído" }) };
  const transcription = new TranscriptionService(whisper);
  const app = express();
  app.use(
    "/webhooks/voz",
    createVoiceWebhook({
      reports,
      transcription,
      authToken: AUTH_TOKEN,
      publicBaseUrl: BASE_URL,
      descargarGrabacion: async () => ({ bytes: Buffer.from("audio"), contentType: "audio/wav" }),
    }),
  );
  return { app, reports };
}

describe("POST /webhooks/voz", () => {
  it("responde TwiML pidiendo grabación", async () => {
    const { app } = buildApp();
    const params = { CallSid: "CA123", From: "+5216180000000" };
    const signature = firmar(`${BASE_URL}/webhooks/voz`, params);

    const response = await request(app)
      .post("/webhooks/voz")
      .set("x-twilio-signature", signature)
      .type("form")
      .send(params);

    expect(response.status).toBe(200);
    expect(response.text).toContain("<Record");
  });
});

describe("POST /webhooks/voz/grabacion", () => {
  it("transcribe la grabación y crea un reporte", async () => {
    const { app, reports } = buildApp();
    const params = {
      CallSid: "CA123",
      From: "+5216180000000",
      RecordingUrl: "https://api.twilio.com/recording/RE123",
      RecordingDuration: "12",
    };
    const signature = firmar(`${BASE_URL}/webhooks/voz/grabacion`, params);

    const response = await request(app)
      .post("/webhooks/voz/grabacion")
      .set("x-twilio-signature", signature)
      .type("form")
      .send(params);

    expect(response.status).toBe(200);
    const creados = await reports.listarPorCiudadano("+5216180000000");
    expect(creados).toHaveLength(1);
    expect(creados[0].texto).toBe("Hay un poste caído");
    expect(creados[0].canal).toBe("llamada");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run test/unit/voice.webhook.test.ts`
Expected: FAIL — `Cannot find module '../../src/presentation/voice.webhook'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// backend/src/presentation/voice.webhook.ts
import express, { Router, type Request } from "express";

import type { ReportsRepository } from "../data/firestore/reports.repo";
import type { TranscriptionService } from "../business/services/transcription.service";
import { validateTwilioSignature } from "../mcp/clients/twilio.client";
import { parseRecordingPayload } from "../mcp/tools/recibir-grabacion.tool";

export interface VoiceWebhookDeps {
  reports: ReportsRepository;
  transcription: TranscriptionService;
  authToken: string;
  publicBaseUrl: string;
  descargarGrabacion: (url: string) => Promise<{ bytes: Buffer; contentType: string }>;
}

function firmaValida(req: Request, deps: VoiceWebhookDeps): boolean {
  const signature = req.header("x-twilio-signature") ?? "";
  const url = `${deps.publicBaseUrl}${req.originalUrl}`;
  return validateTwilioSignature({
    authToken: deps.authToken,
    url,
    parameters: req.body as Record<string, string>,
    signature,
  });
}

export function createVoiceWebhook(deps: VoiceWebhookDeps): Router {
  const router = Router();
  router.use(express.urlencoded({ extended: false }));

  router.post("/", (req, res) => {
    if (!firmaValida(req, deps)) {
      res.status(403).send("Firma inválida.");
      return;
    }
    const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say language="es-MX">Cuéntenos qué pasó y su ubicación aproximada, después del tono.</Say><Record action="/webhooks/voz/grabacion" method="POST" maxLength="120" /></Response>`;
    res.status(200).type("text/xml").send(twiml);
  });

  router.post("/grabacion", async (req, res) => {
    if (!firmaValida(req, deps)) {
      res.status(403).send("Firma inválida.");
      return;
    }

    let payload;
    try {
      payload = parseRecordingPayload(req.body as Record<string, string | undefined>);
    } catch (error) {
      res.status(400).send((error as Error).message);
      return;
    }

    const from = (req.body.From as string | undefined) ?? payload.callSid;
    const { bytes, contentType } = await deps.descargarGrabacion(payload.recordingUrl);
    const transcrito = await deps.transcription.transcribir(bytes, `llamada-${payload.callSid}`, contentType);
    await deps.reports.crear({ ciudadanoId: from, canal: "llamada", texto: transcrito.texto, coordenadas: [0, 0] });
    res.status(200).type("text/xml").send(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`);
  });

  return router;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run test/unit/voice.webhook.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/presentation/voice.webhook.ts backend/test/unit/voice.webhook.test.ts
git commit -m "feat: wire POST /webhooks/voz and /webhooks/voz/grabacion"
```

---

### Task 7: `app.ts` + `firebase-admin.ts` + `index.ts` — ensamblar y levantar el servidor real

**Files:**
- Create: `backend/src/app.ts`
- Create: `backend/src/data/firebase-admin.ts`
- Modify: `backend/src/index.ts`
- Test: `backend/test/unit/app.test.ts`

**Interfaces:**
- Consumes: todos los `createX(...)` de Tasks 3–6.
- Produces: `createApp(deps: AppDependencies): Express` — usado por `index.ts` y por el smoke test manual (Step 6).

- [ ] **Step 1: Write the failing test**

```typescript
// backend/test/unit/app.test.ts
import request from "supertest";
import { describe, expect, it } from "vitest";

import { TranscriptionService, type WhisperClient } from "../../src/business/services/transcription.service";
import { createApp } from "../../src/app";
import { createFakeReportsRepository } from "../helpers/fake-reports-repo";

function buildApp() {
  const reports = createFakeReportsRepository();
  const whisper: WhisperClient = { transcribir: async () => ({ texto: "" }) };
  const app = createApp({
    reports,
    transcription: new TranscriptionService(whisper),
    twilioAuthToken: "test-auth-token",
    publicBaseUrl: "http://localhost:3000",
    descargarMediaWhatsapp: async () => ({ bytes: Buffer.from(""), contentType: "audio/wav" }),
    descargarGrabacionVoz: async () => ({ bytes: Buffer.from(""), contentType: "audio/wav" }),
  });
  return { app, reports };
}

describe("createApp", () => {
  it("monta /reportes/ingesta y /admin/reportes juntos", async () => {
    const { app } = buildApp();

    const creado = await request(app).post("/reportes/ingesta").send({
      ciudadanoId: "c1",
      canal: "formulario",
      texto: "Semáforo descompuesto",
      coordenadas: [24.02, -104.67],
    });
    expect(creado.status).toBe(201);

    const bandeja = await request(app).get("/admin/reportes");
    expect(bandeja.status).toBe(200);
    expect(bandeja.body.reportes).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run test/unit/app.test.ts`
Expected: FAIL — `Cannot find module '../../src/app'`

- [ ] **Step 3: Write `app.ts`**

```typescript
// backend/src/app.ts
import express, { type Express } from "express";

import type { ReportsRepository } from "./data/firestore/reports.repo";
import type { TranscriptionService } from "./business/services/transcription.service";
import { createAdminController } from "./presentation/admin.controller";
import { createReportController } from "./presentation/report.controller";
import { createVoiceWebhook } from "./presentation/voice.webhook";
import { createWhatsappWebhook } from "./presentation/whatsapp.webhook";

export interface AppDependencies {
  reports: ReportsRepository;
  transcription: TranscriptionService;
  twilioAuthToken: string;
  publicBaseUrl: string;
  descargarMediaWhatsapp: (url: string) => Promise<{ bytes: Buffer; contentType: string }>;
  descargarGrabacionVoz: (url: string) => Promise<{ bytes: Buffer; contentType: string }>;
}

export function createApp(deps: AppDependencies): Express {
  const app = express();
  app.use(express.json());

  app.use("/reportes/ingesta", createReportController(deps.reports));
  app.use("/admin", createAdminController(deps.reports));
  app.use(
    "/webhooks/whatsapp",
    createWhatsappWebhook({
      reports: deps.reports,
      transcription: deps.transcription,
      authToken: deps.twilioAuthToken,
      publicBaseUrl: deps.publicBaseUrl,
      descargarMedia: deps.descargarMediaWhatsapp,
    }),
  );
  app.use(
    "/webhooks/voz",
    createVoiceWebhook({
      reports: deps.reports,
      transcription: deps.transcription,
      authToken: deps.twilioAuthToken,
      publicBaseUrl: deps.publicBaseUrl,
      descargarGrabacion: deps.descargarGrabacionVoz,
    }),
  );

  return app;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run test/unit/app.test.ts`
Expected: PASS (1 test)

- [ ] **Step 5: Write `firebase-admin.ts` and rewrite `index.ts`**

```typescript
// backend/src/data/firebase-admin.ts
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

export function initFirebaseAdmin() {
  if (getApps().length === 0) {
    const projectId = process.env.FIREBASE_PROJECT_ID ?? "triage072-dev";
    const credsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    initializeApp(credsPath ? { credential: cert(credsPath), projectId } : { projectId });
  }
  return { db: getFirestore() };
}
```

```typescript
// backend/src/index.ts
import "dotenv/config";

import { createApp } from "./app";
import { TranscriptionService, UnconfiguredWhisperClient, createWhisperHttpClient } from "./business/services/transcription.service";
import { initFirebaseAdmin } from "./data/firebase-admin";
import { createReportsRepository } from "./data/firestore/reports.repo";

const { db } = initFirebaseAdmin();
const reports = createReportsRepository(db);

const whisperClient = process.env.WHISPER_API_KEY
  ? createWhisperHttpClient(process.env.WHISPER_API_KEY)
  : new UnconfiguredWhisperClient();
const transcription = new TranscriptionService(whisperClient);

async function descargarArchivo(url: string) {
  const auth = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID ?? ""}:${process.env.TWILIO_AUTH_TOKEN ?? ""}`).toString(
    "base64",
  );
  const response = await fetch(url, { headers: { authorization: `Basic ${auth}` } });
  const bytes = Buffer.from(await response.arrayBuffer());
  return { bytes, contentType: response.headers.get("content-type") ?? "application/octet-stream" };
}

const app = createApp({
  reports,
  transcription,
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN ?? "",
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? "http://localhost:3000",
  descargarMediaWhatsapp: descargarArchivo,
  descargarGrabacionVoz: descargarArchivo,
});

const PORT = process.env.PORT ?? 3000;
app.listen(PORT, () => {
  console.log(`Triage 072 backend escuchando en :${PORT}`);
});

export { app };
```

- [ ] **Step 6: Run the full test suite**

Run: `cd backend && npm test`
Expected: PASS — all suites green (schemas, report.controller, admin.controller, whatsapp.webhook, voice.webhook, app, plus the pre-existing cost.service/maps-fallback/twilio-webhook tests).

- [ ] **Step 7: Commit**

```bash
git add backend/src/app.ts backend/src/data/firebase-admin.ts backend/src/index.ts backend/test/unit/app.test.ts
git commit -m "feat: assemble createApp and wire firebase-admin into index.ts"
```

- [ ] **Step 8: Manual curl smoke test against the real server**

This step is exploratory, not part of the automated suite — it proves the wiring works end to end against the local Firestore emulator declared in the root `firebase.json`.

```bash
cd "/home/sebastian/Curso Metaphorce/ProyectoReportes/TriageDGO"
npx firebase emulators:start --only firestore &
sleep 5

cd backend
FIRESTORE_EMULATOR_HOST=localhost:8080 npm run dev &
sleep 3

curl -s -X POST http://localhost:3000/reportes/ingesta \
  -H "content-type: application/json" \
  -d '{"ciudadanoId":"ciudadano-curl","canal":"formulario","texto":"Bache en Av. 20 de Noviembre","coordenadas":[24.0277,-104.6532]}' | tee /tmp/reporte.json

curl -s http://localhost:3000/admin/reportes

REPORTE_ID=$(node -pe "JSON.parse(require('fs').readFileSync('/tmp/reporte.json')).reporte_id")
curl -s http://localhost:3000/admin/reportes/$REPORTE_ID

curl -s -X POST http://localhost:3000/reportes/ingesta \
  -H "content-type: application/json" \
  -d '{"ciudadanoId":"c2","canal":"formulario","texto":"x","coordenadas":[999,0]}'
# Expected: 400 with validation error detail
```

Stop both background processes (`kill %1 %2` or close the terminals) once the smoke test is confirmed.

---

## Self-Review Notes

- **Spec coverage:** `POST /reportes/ingesta` (arq.md §2.2) → Task 3. `POST /webhooks/whatsapp` (arq.md §2.2) → Task 5. `POST /webhooks/voz` + grabación (arq.md §2.2) → Task 6. Bandeja admin de solo lectura (arq.md §2.1, recorte deliberado: sin WebSocket/SSE en tiempo real, fuera de alcance de "wiring mínimo") → Task 4. Firma Twilio (arq.md, ya implementada en `twilio.client.ts`) → reutilizada en Tasks 5–6, no reimplementada.
- **Fuera de alcance, documentado explícitamente:** orquestación del Supervisor y los 6 agentes `claude -p`, reglas de arbitraje/prioridad, subida de evidencia a Storage, RAG. Estos endpoints solo persisten el `ReporteCrudo`; no disparan clasificación todavía.
- **Placeholder scan:** ningún paso usa TBD/"similar a"/fallback genérico; todo el código de cada step es completo y compila contra las interfaces ya definidas en tasks previos.
- **Type consistency:** `ReportsRepository` se extiende una sola vez (Task 4) y todos los tasks posteriores importan el tipo ya extendido; `WhatsappWebhookDeps`/`VoiceWebhookDeps`/`AppDependencies` usan los mismos nombres de campo en su definición (Tasks 5/6) y en su uso (Task 7).
