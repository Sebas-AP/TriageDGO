import cors from "cors";
import { createHash, randomUUID } from "node:crypto";
import express, { type RequestHandler } from "express";
import { ReportIngestionService } from "./business/services/report-ingestion.service";
import { ReportQueryService } from "./business/services/report-query.service";
import { InMemoryTriageStore } from "./data/firestore/triage.store";
import { FirestoreTriageStore } from "./data/firestore/firestore.store";
import { FirebaseAdminUsersDirectory, InMemoryAdminUsers, type AdminUsersDirectory } from "./data/firestore/admin-users.directory";
import { AdminEvents } from "./business/services/admin-events";
import { firebasePrincipal } from "./presentation/auth.middleware";
import { createIngestionController } from "./presentation/ingestion.controller";
import type { Principal, Report, TriageStore } from "./business/types";

export interface AppDependencies { store?: TriageStore; authenticate?: (request: Parameters<RequestHandler>[0]) => Promise<Principal>; adminUsers?: AdminUsersDirectory; events?: AdminEvents; }
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
  const adminUsers = deps.adminUsers ?? (process.env.FIREBASE_PROJECT_ID ? new FirebaseAdminUsersDirectory() : new InMemoryAdminUsers());
  const events = deps.events ?? new AdminEvents();
  const authenticateIngestion = async (request: Parameters<RequestHandler>[0]): Promise<Principal> => {
    if (request.header("authorization")) return authenticate(request);
    const idempotencyKey = request.get("Idempotency-Key") ?? randomUUID();
    const submissionId = createHash("sha256").update(idempotencyKey).digest("hex");
    return { uid: `public:${submissionId}`, role: "invitado", areas: [] };
  };
  app.use("/reportes/ingesta", createIngestionController({ ingestion: new ReportIngestionService(store), authenticate: authenticateIngestion }));
  const reportQuery = new ReportQueryService(store);
  const toCitizen = (report: Awaited<ReturnType<typeof store.getReport>>) => report && ({ id: report.reporte_id, folio: report.reporte_id, status: citizenStatus(report), createdAt: report.created_at, location: { address: report.location?.address, lat: report.coordenadas[0], lng: report.coordenadas[1] } });
  const adminOnly = async (req: Parameters<RequestHandler>[0], res: express.Response) => {
    try { const principal = await authenticate(req); if (principal.role !== "admin") { res.status(403).json({ error: "FORBIDDEN" }); return; } return principal; } catch { res.status(401).json({ error: "UNAUTHENTICATED" }); return; }
  };
  app.get("/ciudadano/reportes", async (req, res) => {
    try { const principal = await authenticate(req); if (principal.role !== "invitado") return res.status(403).json({ error: "FORBIDDEN" }); const reports = (await store.listReports()).filter((report) => report.ciudadano_id === principal.uid).map((report) => toCitizen(report)); return res.json({ reports }); } catch { return res.status(401).json({ error: "UNAUTHENTICATED" }); }
  });
  app.get("/ciudadano/reportes/:reporteId", async (req, res) => {
    try { const principal = await authenticate(req); const report = await store.getReport(req.params.reporteId); if (!report || principal.role !== "invitado" || report.ciudadano_id !== principal.uid) return res.status(404).json({ error: "NOT_FOUND" }); return res.json(toCitizen(report)); } catch { return res.status(401).json({ error: "UNAUTHENTICATED" }); }
  });
  const clarificationSessions = new Map<string, { owner: string; turns: number }>();
  app.post("/reportes/aclarificacion", async (req, res) => {
    try {
      const principal = await authenticate(req); if (principal.role !== "invitado") return res.status(403).json({ error: "FORBIDDEN" });
      const body = req.body as { sessionId?: unknown; description?: unknown; answers?: Array<{ answer?: unknown }> };
      if (typeof body.sessionId !== "string") { if (typeof body.description !== "string" || !body.description.trim()) return res.status(400).json({ error: "INVALID_CLARIFICATION" }); const sessionId = randomUUID(); clarificationSessions.set(sessionId, { owner: principal.uid, turns: 1 }); return res.json({ sessionId, complete: false, questions: ["¿Puedes indicar una referencia cercana o el tamaño aproximado?"] }); }
      const session = clarificationSessions.get(body.sessionId); if (!session || session.owner !== principal.uid) return res.status(404).json({ error: "NOT_FOUND" });
      const unknown = body.answers?.some((answer) => typeof answer.answer === "string" && /^(no (lo )?s[eé]|no s[eé]|desconozco|no puedo)/i.test(answer.answer.trim())) ?? false;
      session.turns += 1; if (unknown || session.turns >= 3) return res.json({ sessionId: body.sessionId, complete: true, questions: [] });
      return res.json({ sessionId: body.sessionId, complete: false, questions: ["¿Hay algún riesgo inmediato para personas o vehículos?"] });
    } catch { return res.status(401).json({ error: "UNAUTHENTICATED" }); }
  });
  app.get("/reportes/:reporteId", async (req, res) => {
    const report = await reportQuery.getPublicStatus(req.params.reporteId);
    if (!report) return res.sendStatus(404);
    // A folio is a bearer capability. Do not disclose precise coordinates to anyone who obtains it.
    return res.json({ id: report.reporte_id, folio: report.reporte_id, status: report.estado === "encolado" ? "received" : report.estado === "completado" ? "ready" : report.estado === "revision_manual" ? "failed" : "processing", location: { address: "Ubicación recibida" }, createdAt: report.created_at });
  });
  app.get("/admin/reportes", async (req, res) => {
    const principal = await adminOnly(req, res); if (!principal) return;
    const reports = (await store.listReports()).filter((report) => principal.accessLevel === "coordinator" ? (!report.area_responsable || principal.areas.includes(report.area_responsable)) : report.asignado_a === principal.uid).map(toAdmin);
    return res.json({ reports });
  });
  app.patch("/admin/reportes/:reporteId/asignacion", async (req, res) => {
    const principal = await adminOnly(req, res); if (!principal) return; if (principal.accessLevel !== "coordinator") return res.status(403).json({ error: "FORBIDDEN" });
    const body = req.body as { assigneeId?: unknown; area?: unknown }; if (typeof body.assigneeId !== "string" || typeof body.area !== "string" || !principal.areas.includes(body.area)) return res.status(400).json({ error: "INVALID_ASSIGNMENT" });
    const report = await store.updateReport(req.params.reporteId, { asignado_a: body.assigneeId, area_responsable: body.area, progreso: "asignado" }); if (!report) return res.status(404).json({ error: "NOT_FOUND" }); events.publish(report.reporte_id, [body.area]); return res.json({ report: toAdmin(report) });
  });
  app.get("/admin/reportes/:reporteId", async (req, res) => {
    const principal = await adminOnly(req, res); if (!principal) return; const report = await store.getReport(req.params.reporteId);
    if (!report || !canAccess(principal, report)) return res.status(404).json({ error: "NOT_FOUND" }); return res.json({ report: toAdminDetail(report) });
  });
  app.patch("/admin/reportes/:reporteId", async (req, res) => {
    const principal = await adminOnly(req, res); if (!principal) return; const report = await store.getReport(req.params.reporteId);
    if (!report || !canAccess(principal, report)) return res.status(404).json({ error: "NOT_FOUND" }); const body = req.body as { progress?: unknown; priority?: unknown; note?: unknown };
    const progress = ["recibido", "en_analisis", "asignado", "en_atencion", "resuelto", "cerrado"].includes(body.progress as string) ? body.progress as Report["progreso"] : undefined;
    const priority = ["P0", "P1", "P2", "P3"].includes(body.priority as string) ? body.priority as Report["prioridad"] : undefined;
    if ((body.progress !== undefined && !progress) || (body.priority !== undefined && !priority) || (body.note !== undefined && (typeof body.note !== "string" || !body.note.trim()))) return res.status(400).json({ error: "INVALID_UPDATE" });
    const notes = typeof body.note === "string" ? [...(report.notas ?? []), { text: body.note.trim(), author_id: principal.uid, created_at: new Date().toISOString() }] : undefined;
    const updated = await store.updateReport(report.reporte_id, { ...(progress ? { progreso: progress } : {}), ...(priority ? { prioridad: priority } : {}), ...(notes ? { notas: notes } : {}) }); events.publish(report.reporte_id, report.area_responsable ? [report.area_responsable] : []); return res.json({ report: toAdminDetail(updated!) });
  });
  app.patch("/admin/reportes/:reporteId/estado", async (req, res) => {
    const principal = await adminOnly(req, res); if (!principal) return; const report = await store.getReport(req.params.reporteId); if (!report || !canAccess(principal, report)) return res.status(404).json({ error: "NOT_FOUND" });
    const body = req.body as { status?: unknown; note?: unknown }; const progress = operationalProgress(body.status); if (!progress || (body.note !== undefined && (typeof body.note !== "string" || !body.note.trim()))) return res.status(400).json({ error: "INVALID_UPDATE" });
    const notes = typeof body.note === "string" ? [...(report.notas ?? []), { text: body.note.trim(), author_id: principal.uid, created_at: new Date().toISOString() }] : report.notas; const updated = await store.updateReport(report.reporte_id, { progreso: progress, ...(notes ? { notas: notes } : {}) }); events.publish(report.reporte_id, report.area_responsable ? [report.area_responsable] : []); return res.json(toFrontendRecord(updated!));
  });
  app.post("/admin/reportes/:reporteId/notas", async (req, res) => {
    const principal = await adminOnly(req, res); if (!principal) return; const report = await store.getReport(req.params.reporteId); const text = (req.body as { text?: unknown }).text; if (!report || !canAccess(principal, report)) return res.status(404).json({ error: "NOT_FOUND" }); if (typeof text !== "string" || !text.trim()) return res.status(400).json({ error: "INVALID_UPDATE" }); const updated = await store.updateReport(report.reporte_id, { notas: [...(report.notas ?? []), { text: text.trim(), author_id: principal.uid, created_at: new Date().toISOString() }] }); events.publish(report.reporte_id, report.area_responsable ? [report.area_responsable] : []); return res.json(toFrontendRecord(updated!));
  });
  app.patch("/admin/reportes/:reporteId/prioridad", async (req, res) => {
    const principal = await adminOnly(req, res); if (!principal) return; const report = await store.getReport(req.params.reporteId); const priority = (req.body as { priority?: unknown }).priority; if (!report || !canAccess(principal, report)) return res.status(404).json({ error: "NOT_FOUND" }); if (!["P0", "P1", "P2", "P3"].includes(priority as string)) return res.status(400).json({ error: "INVALID_UPDATE" }); const updated = await store.updateReport(report.reporte_id, { prioridad: priority as Report["prioridad"] }); events.publish(report.reporte_id, report.area_responsable ? [report.area_responsable] : []); return res.json(toFrontendRecord(updated!));
  });
  app.get("/mapas/geocodificar", (req, res) => { const address = typeof req.query.address === "string" ? req.query.address.trim() : ""; return res.json({ result: null, provider: "fallback", ...(address ? {} : { warning: "address required" }) }); });
  app.get("/maps/autocomplete", (req, res) => { const query = typeof req.query.q === "string" ? req.query.q.trim() : ""; return res.json({ predictions: [], provider: "fallback", ...(query ? {} : { warning: "query required" }) }); });
  app.get("/maps/geocode", (req, res) => { const address = typeof req.query.address === "string" ? req.query.address.trim() : ""; return res.json({ result: null, provider: "fallback", ...(address ? {} : { warning: "address required" }) }); });
  app.get("/admin/eventos", async (req, res) => {
    const principal = await adminOnly(req, res); if (!principal) return;
    res.status(200).set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" }); res.flushHeaders();
    res.write(`event: ready\ndata: ${JSON.stringify({ type: "ready", accessLevel: principal.accessLevel ?? "operator", areas: principal.areas })}\n\n`);
    const heartbeat = setInterval(() => res.write(`event: heartbeat\ndata: ${JSON.stringify({ type: "heartbeat", at: new Date().toISOString() })}\n\n`), 25_000);
    const unsubscribe = events.subscribe((event) => { if (event.areas.length === 0 || event.areas.some((area) => principal.areas.includes(area))) res.write(`id: ${event.eventId}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`); });
    req.on("close", () => { clearInterval(heartbeat); unsubscribe(); });
  });
  const coordinatorOnly = async (req: Parameters<RequestHandler>[0], res: express.Response) => { const principal = await adminOnly(req, res); return principal?.accessLevel === "coordinator" ? principal : (principal ? (res.status(403).json({ error: "FORBIDDEN" }), undefined) : undefined); };
  app.get("/admin/usuarios", async (req, res) => { const principal = await coordinatorOnly(req, res); if (!principal) return; const users = (await adminUsers.list()).filter((user) => user.areas.every((area) => principal.areas.includes(area))); return res.json({ users }); });
  app.post("/admin/usuarios", async (req, res) => { const principal = await coordinatorOnly(req, res); if (!principal) return; const body = req.body as { email?: unknown; password?: unknown; name?: unknown; areas?: unknown; accessLevel?: unknown }; if (!validUserBody(body, true) || !body.areas.every((area) => principal.areas.includes(area))) return res.status(400).json({ error: "INVALID_USER" }); try { const user = await adminUsers.create({ email: body.email, password: body.password, name: body.name, areas: body.areas, accessLevel: body.accessLevel }); return res.status(201).json({ user }); } catch { return res.status(409).json({ error: "USER_CONFLICT" }); } });
  app.patch("/admin/usuarios/:userId", async (req, res) => { const principal = await coordinatorOnly(req, res); if (!principal) return; const body = req.body as { name?: unknown; areas?: unknown; accessLevel?: unknown }; if (!validUserBody(body, false) || (body.areas && !body.areas.every((area) => principal.areas.includes(area)))) return res.status(400).json({ error: "INVALID_USER" }); const user = await adminUsers.update(req.params.userId, body); return user ? res.json({ user }) : res.status(404).json({ error: "NOT_FOUND" }); });
  app.patch("/admin/usuarios/:userId/estado", async (req, res) => { const principal = await coordinatorOnly(req, res); if (!principal) return; const active = (req.body as { active?: unknown }).active; if (typeof active !== "boolean") return res.status(400).json({ error: "INVALID_USER" }); const user = await adminUsers.setActive(req.params.userId, active); return user ? res.json({ user }) : res.status(404).json({ error: "NOT_FOUND" }); });
  return app;
}
function citizenStatus(report: { progreso?: string; estado: string }) { return report.progreso === "resuelto" || report.progreso === "cerrado" ? "resolved" : report.progreso === "en_atencion" ? "in_progress" : report.progreso === "asignado" ? "assigned" : report.estado === "encolado" ? "received" : report.estado === "completado" ? "ready" : report.estado === "revision_manual" ? "failed" : "processing"; }
function toAdmin(report: Awaited<ReturnType<TriageStore["getReport"]>>) { return report && ({ id: report.reporte_id, folio: report.reporte_id, description: report.texto, status: citizenStatus(report), area: report.area_responsable, category: report.categoria, priority: report.prioridad, assigneeId: report.asignado_a, createdAt: report.created_at, location: { address: report.location?.address, lat: report.coordenadas[0], lng: report.coordenadas[1] } }); }
function canAccess(principal: Principal, report: Report) { return principal.accessLevel === "coordinator" ? !report.area_responsable || principal.areas.includes(report.area_responsable) : report.asignado_a === principal.uid; }
function toAdminDetail(report: Report) { return { ...toAdmin(report), progress: report.progreso ?? "recibido", priority: report.prioridad, notes: (report.notas ?? []).map((note) => ({ text: note.text, authorId: note.author_id, createdAt: note.created_at })), contact: report.contact, answers: report.answers ?? [], evidence: report.adjuntos ?? [] }; }
function validUserBody(body: { email?: unknown; password?: unknown; name?: unknown; areas?: unknown; accessLevel?: unknown }, creating: boolean): body is { email: string; password: string; name: string; areas: string[]; accessLevel: "operator" | "coordinator" } {
  if (creating && (typeof body.email !== "string" || !/^\S+@\S+\.\S+$/.test(body.email) || typeof body.password !== "string" || body.password.length < 8)) return false;
  if (body.name !== undefined && (typeof body.name !== "string" || !body.name.trim())) return false;
  if (body.areas !== undefined && (!Array.isArray(body.areas) || !body.areas.every((area): area is string => typeof area === "string" && area.trim().length > 0))) return false;
  return body.accessLevel === undefined || body.accessLevel === "operator" || body.accessLevel === "coordinator";
}
function operationalProgress(status: unknown): Report["progreso"] | undefined { return ({ new: "recibido", review: "en_analisis", assigned: "asignado", in_progress: "en_atencion", resolved: "resuelto", closed: "cerrado" } as Record<string, Report["progreso"]>)[status as string]; }
function toFrontendRecord(report: Report) { return { ...toAdminDetail(report), operationalStatus: report.progreso === "en_atencion" ? "in_progress" : report.progreso === "en_analisis" ? "review" : report.progreso ?? "new", updatedAt: report.created_at, citizenName: report.contact?.name ?? "", phone: report.contact?.phone ?? "", channel: report.canal === "formulario" ? "form" : report.canal === "voz" ? "call" : "whatsapp", followUps: [], auditLog: [], similarReports: [], agents: {} }; }
