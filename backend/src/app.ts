import cors from "cors";
import { createHash, randomUUID } from "node:crypto";
import express, { type RequestHandler } from "express";
import { ReportIngestionService } from "./business/services/report-ingestion.service";
import { ReportQueryService } from "./business/services/report-query.service";
import { InMemoryTriageStore } from "./data/firestore/triage.store";
import { FirestoreTriageStore } from "./data/firestore/firestore.store";
import { firebasePrincipal } from "./presentation/auth.middleware";
import { createIngestionController } from "./presentation/ingestion.controller";
import type { Principal, TriageStore } from "./business/types";

export interface AppDependencies { store?: TriageStore; authenticate?: (request: Parameters<RequestHandler>[0]) => Promise<Principal>; }
const defaultAuthenticate = async (request: Parameters<RequestHandler>[0]): Promise<Principal> => firebasePrincipal({ authorization: request.header("authorization") });

export function createApp(deps: AppDependencies = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Frame-Options", "DENY");
    next();
  });
  app.use(cors({ origin: ["http://localhost:5173"], methods: ["GET", "POST", "PATCH", "OPTIONS"], allowedHeaders: ["Authorization", "Content-Type", "Idempotency-Key"] }));
  app.use(express.json({ limit: "10mb" }));
  const store = deps.store ?? (process.env.FIREBASE_PROJECT_ID ? new FirestoreTriageStore() : new InMemoryTriageStore()); const authenticate = deps.authenticate ?? defaultAuthenticate;
  const authenticateIngestion = async (request: Parameters<RequestHandler>[0]): Promise<Principal> => {
    if (request.header("authorization")) return authenticate(request);
    const idempotencyKey = request.get("Idempotency-Key") ?? randomUUID();
    const submissionId = createHash("sha256").update(idempotencyKey).digest("hex");
    return { uid: `public:${submissionId}`, role: "invitado", areas: [] };
  };
  app.use("/reportes/ingesta", createIngestionController({ ingestion: new ReportIngestionService(store), authenticate: authenticateIngestion }));
  const reportQuery = new ReportQueryService(store);
  app.get("/reportes/:reporteId", async (req, res) => {
    const report = await reportQuery.getPublicStatus(req.params.reporteId);
    if (!report) return res.sendStatus(404);
    // A folio is a bearer capability. Do not disclose precise coordinates to anyone who obtains it.
    return res.json({ id: report.reporte_id, folio: report.reporte_id, status: report.estado === "encolado" ? "received" : report.estado === "completado" ? "ready" : report.estado === "revision_manual" ? "failed" : "processing", location: { address: "Ubicación recibida" }, createdAt: report.created_at });
  });
  app.get("/admin/reportes", async (req, res) => {
    try { const principal = await authenticate(req); if (principal.role !== "admin") return res.status(403).json({ error: "FORBIDDEN" }); return res.json([]); }
    catch { return res.status(401).json({ error: "UNAUTHENTICATED" }); }
  });
  return app;
}
