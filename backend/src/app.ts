import express, { type RequestHandler } from "express";
import { InMemoryTriageStore } from "./data/firestore/triage.store";
import { FirestoreTriageStore } from "./data/firestore/firestore.store";
import { firebasePrincipal } from "./presentation/auth.middleware";
import type { Principal, TriageStore } from "./business/types";

export interface AppDependencies { store?: TriageStore; authenticate?: (request: Parameters<RequestHandler>[0]) => Promise<Principal>; }
const defaultAuthenticate = async (request: Parameters<RequestHandler>[0]): Promise<Principal> => firebasePrincipal({ authorization: request.header("authorization") });

export function createApp(deps: AppDependencies = {}) {
  const app = express(); app.use(express.json({ limit: "10mb" }));
  const store = deps.store ?? (process.env.FIREBASE_PROJECT_ID ? new FirestoreTriageStore() : new InMemoryTriageStore()); const authenticate = deps.authenticate ?? defaultAuthenticate;
  app.post("/reportes/ingesta", async (req, res) => {
    try {
      const principal = await authenticate(req); const body = req.body ?? {};
      if (!principal || !["invitado", "admin"].includes(principal.role)) return res.status(403).json({ error: "FORBIDDEN" });
      if (!body.canal || !body.texto || !Array.isArray(body.coordenadas) || body.coordenadas.length !== 2) return res.status(400).json({ error: "INVALID_REPORT" });
      const idempotencyKey = req.get("Idempotency-Key"); if (!idempotencyKey) return res.status(400).json({ error: "IDEMPOTENCY_KEY_REQUIRED" });
      const { report, job } = await store.enqueue(body, principal, idempotencyKey);
      return res.status(202).json({ reporte_id: report.reporte_id, job_id: job.job_id, estado: "encolado", status_url: `/reportes/${report.reporte_id}` });
    } catch (error) { return res.status(error instanceof Error && error.message === "UNAUTHENTICATED" ? 401 : 500).json({ error: "INGESTION_FAILED" }); }
  });
  app.get("/reportes/:reporteId", async (req, res) => {
    try { const principal = await authenticate(req); const report = await store.getReport(req.params.reporteId); if (!report) return res.sendStatus(404); if (principal.role !== "admin" && report.ciudadano_id !== principal.uid) return res.sendStatus(403); return res.json(report); }
    catch { return res.sendStatus(401); }
  });
  return app;
}
