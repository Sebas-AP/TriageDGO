import {
  browserLocalPersistence,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signInAnonymously,
  signOut,
  type User,
} from "firebase/auth";
import { config } from "../config";
import { firebaseAuth } from "../lib/firebase";
import type {
  AdminEvent,
  AdminUser,
  ManagedAdminUser,
  FollowUpInput,
  LocationValue,
  MapSuggestion,
  OperationalStatus,
  Priority,
  ProblemCluster,
  ReportRecord,
  ReportSubmission,
  ClarificationRequest,
  ClarificationResponse,
} from "../types";
import type { AdminService, AuthService, MapService, RealtimeService, ReportService, Services } from "./contracts";

async function responseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const message =
      typeof body === "object" && body !== null && "message" in body && typeof body.message === "string"
        ? body.message
        : "No fue posible completar la solicitud.";
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

function createIdempotencyKey() {
  return crypto.randomUUID();
}

async function authHeaders(): Promise<HeadersInit> {
  const user = firebaseAuth().currentUser;
  const token = user ? await user.getIdToken() : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function toAdminUser(user: User, claims?: Record<string, unknown>): AdminUser {
  return { uid: user.uid, email: user.email || "admin", role: "admin", accessLevel: claims?.accessLevel === "coordinator" ? "coordinator" : "operator", areas: Array.isArray(claims?.areas) ? claims.areas.filter((area): area is string => typeof area === "string") : [] };
}

async function ensureCitizen() {
  const instance = firebaseAuth();
  if (!instance.currentUser) {
    try {
      await setPersistence(instance, browserLocalPersistence);
      await signInAnonymously(instance);
    } catch (cause) {
      const code = typeof cause === "object" && cause !== null && "code" in cause ? String(cause.code) : "";
      if (code.includes("api-key-not-valid")) {
        throw new Error("La configuración de Firebase del frontend no tiene una API key válida. Configura VITE_FIREBASE_API_KEY y reinicia Vite.");
      }
      if (code.includes("operation-not-allowed")) {
        throw new Error("Activa el proveedor Anonymous en Firebase Authentication para permitir el acceso como invitado.");
      }
      throw cause;
    }
  }
}

function toReport(record: { id: string; folio: string; status: string; createdAt: string; location: LocationValue; description?: string; area?: string; category?: string; priority?: Priority; assigneeId?: string; patternDetected?: boolean; similarCount?: number; acknowledgmentSent?: boolean; agentStatuses?: Partial<Record<"classifier" | "pattern" | "acuse", "done" | "error">> }): ReportRecord {
  const operationalStatus: Record<string, ReportRecord["operationalStatus"]> = { received: "new", processing: "review", ready: "review", failed: "review", assigned: "assigned", in_progress: "in_progress", resolved: "resolved" };
  const ticket = record.category && record.area && record.priority ? { id: `ticket-${record.id}`, folio: record.folio, priority: record.priority, area: record.area, category: record.category, patternDetected: Boolean(record.patternDetected), triggeredRule: "Clasificación automática", acknowledgmentSent: Boolean(record.acknowledgmentSent), manualReview: record.status === "failed" } : undefined;
  const status = (agent: "classifier" | "pattern" | "acuse") => record.agentStatuses?.[agent] ?? (ticket ? "done" : "pending");
  return { id: record.id, folio: record.folio, citizenName: "", phone: "", description: record.description || "Reporte ciudadano", location: record.location, status: record.status === "resolved" ? "ready" : record.status === "assigned" || record.status === "in_progress" ? "processing" : record.status === "failed" ? "failed" : "received", operationalStatus: operationalStatus[record.status] || "review", channel: "form", createdAt: record.createdAt, updatedAt: record.createdAt, assignee: record.assigneeId, team: record.area, agents: { classifier: { agent: "classifier", status: status("classifier") }, pattern: { agent: "pattern", status: status("pattern") }, acuse: { agent: "acuse", status: status("acuse") } }, ticket, similarReports: [], similarCount: record.similarCount ?? 0, followUps: [], notes: [], auditLog: [] };
}

const reports: ReportService = {
  async submit(input: ReportSubmission) {
    await ensureCitizen();
    const form = new FormData();
    form.set("citizenName", input.citizenName);
    form.set("phone", input.phone);
    form.set("consent", String(input.consent));
    form.set("description", input.description);
    form.set("location", JSON.stringify(input.location));
    if (input.clarificationAnswer) form.set("clarificationAnswer", input.clarificationAnswer);
    if (input.clarificationAnswers) form.set("answers", JSON.stringify(input.clarificationAnswers));
    if (input.photo) form.set("photo", input.photo);
    return responseJson(
      await fetch(`${config.apiBaseUrl}/reportes/ingesta`, {
        method: "POST",
        headers: { "Idempotency-Key": input.idempotencyKey || createIdempotencyKey(), ...(await authHeaders()) },
        body: form,
      }),
    );
  },
  async requestClarification(input: ClarificationRequest | string, revision?: number) {
    await ensureCitizen();
    const body = typeof input === "string" ? { description: input, revision } : input;
    return responseJson<ClarificationResponse>(
      await fetch(`${config.apiBaseUrl}/reportes/aclarificacion`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify(body),
      }),
    );
  },
  async getPublicReport(folio) {
    const response = await fetch(`${config.apiBaseUrl}/reportes/${encodeURIComponent(folio)}`);
    if (response.status === 404) return null;
    return toReport(await responseJson(response));
  },
  async listMine() {
    await ensureCitizen();
    const data = await responseJson<{ reports: Array<{ id: string; folio: string; status: string; createdAt: string; location: LocationValue }> }>(await fetch(`${config.apiBaseUrl}/ciudadano/reportes`, { headers: await authHeaders() }));
    return data.reports.map(toReport);
  },
  async getMine(reportId) {
    await ensureCitizen();
    const response = await fetch(`${config.apiBaseUrl}/ciudadano/reportes/${encodeURIComponent(reportId)}`, { headers: await authHeaders() });
    if (response.status === 404) return null;
    return toReport(await responseJson(response));
  },
};

const maps: MapService = {
  async autocomplete(query, signal) {
    const payload = await responseJson<unknown>(
      await fetch(`${config.apiBaseUrl}/maps/autocomplete?q=${encodeURIComponent(query)}`, { signal }),
    );
    if (Array.isArray(payload)) return payload as MapSuggestion[];
    if (typeof payload === "object" && payload !== null && "predictions" in payload && Array.isArray(payload.predictions)) {
      return payload.predictions as MapSuggestion[];
    }
    return [];
  },
  async geocode(placeId) {
    const payload = await responseJson<unknown>(
      await fetch(`${config.apiBaseUrl}/maps/geocode?placeId=${encodeURIComponent(placeId)}`),
    );
    if (typeof payload === "object" && payload !== null && "lat" in payload && "lng" in payload && "address" in payload) {
      return payload as LocationValue;
    }
    throw new Error("No encontramos esa ubicación. Puedes marcar el punto directamente en el mapa.");
  },
};

async function consumeSse(
  response: Response,
  listener: (event: AdminEvent) => void,
  setLastEventId: (id: string) => void,
) {
  if (!response.ok || !response.body) throw new Error("No fue posible abrir el canal de eventos.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() || "";
    for (const block of blocks) {
      let id = "";
      let data = "";
      for (const line of block.split(/\r?\n/)) {
        if (line.startsWith("id:")) id = line.slice(3).trim();
        if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      if (data) {
        const event = JSON.parse(data) as Partial<AdminEvent>;
        if (typeof event.type === "string" && typeof event.eventId === "string" && typeof event.reportId === "string" && typeof event.timestamp === "string") {
          listener(event as AdminEvent);
          if (id) setLastEventId(id);
        }
      }
    }
  }
}

const realtime: RealtimeService = {
  async listReports() {
    const data = await responseJson<{ reports: Array<{ id: string; folio: string; status: string; createdAt: string; location: LocationValue; description: string; area?: string; assigneeId?: string }> }>(
      await fetch(`${config.apiBaseUrl}/admin/reportes`, { headers: await authHeaders() }),
    );
    return data.reports.map(toReport);
  },
  subscribe(listener, onError) {
    const controller = new AbortController();
    let stopped = false;
    let lastEventId = "";
    let retryTimer: number | undefined;

    const connect = async () => {
      try {
        const headers = new Headers(await authHeaders());
        headers.set("Accept", "text/event-stream");
        if (lastEventId) headers.set("Last-Event-ID", lastEventId);
        const response = await fetch(`${config.apiBaseUrl}/admin/eventos`, {
          headers,
          signal: controller.signal,
        });
        await consumeSse(response, listener, (id) => {
          lastEventId = id;
        });
        if (!stopped) retryTimer = window.setTimeout(connect, 1500);
      } catch (error) {
        if (!stopped && !(error instanceof DOMException && error.name === "AbortError")) {
          onError?.(error instanceof Error ? error : new Error("Error de conexión SSE."));
          retryTimer = window.setTimeout(connect, 2500);
        }
      }
    };
    void connect();
    return () => {
      stopped = true;
      controller.abort();
      if (retryTimer) window.clearTimeout(retryTimer);
    };
  },
};

const auth: AuthService = {
  async currentUser() {
    const user = firebaseAuth().currentUser;
    if (!user) return null;
    const token = await user.getIdTokenResult();
    return token.claims.role === "admin" ? toAdminUser(user, token.claims) : null;
  },
  async login(email, password) {
    const instance = firebaseAuth();
    await setPersistence(instance, browserLocalPersistence);
    const credential = await signInWithEmailAndPassword(instance, email, password);
    const token = await credential.user.getIdTokenResult(true);
    if (token.claims.role !== "admin") {
      await signOut(instance);
      throw new Error("La cuenta no tiene permisos de administrador.");
    }
    return toAdminUser(credential.user, token.claims);
  },
  async logout() {
    await signOut(firebaseAuth());
  },
  async getToken() {
    return firebaseAuth().currentUser?.getIdToken() ?? null;
  },
  onChange(listener) {
    return onAuthStateChanged(firebaseAuth(), async (user) => {
      if (!user) return listener(null);
      const token = await user.getIdTokenResult();
      listener(token.claims.role === "admin" ? toAdminUser(user, token.claims) : null);
    });
  },
};

async function adminMutation<T>(path: string, body: unknown, method = "PATCH") {
  return responseJson<T>(
    await fetch(`${config.apiBaseUrl}${path}`, {
      method,
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify(body),
    }),
  );
}

const admin: AdminService = {
  async listUsers() { return (await responseJson<{ users: ManagedAdminUser[] }>(await fetch(`${config.apiBaseUrl}/admin/usuarios`, { headers: await authHeaders() }))).users; },
  async createUser(input) { return (await adminMutation<{ user: ManagedAdminUser }>("/admin/usuarios", input, "POST")).user; },
  async setUserActive(userId, active) { return (await adminMutation<{ user: ManagedAdminUser }>(`/admin/usuarios/${encodeURIComponent(userId)}/estado`, { active })).user; },
  async listClusters() {
    return [];
  },
  updateStatus(reportId: string, status: OperationalStatus, note?: string) {
    const progress: Record<OperationalStatus, string> = { new: "recibido", review: "en_analisis", assigned: "asignado", in_progress: "en_atencion", resolved: "resuelto", closed: "cerrado", duplicate: "cerrado", cancelled: "cerrado" };
    return adminMutation<{ report: { id: string; folio: string; status: string; createdAt: string; location: LocationValue; description?: string; area?: string; assigneeId?: string } }>(`/admin/reportes/${reportId}`, { progress: progress[status], ...(note ? { note } : {}) }).then((data) => toReport(data.report));
  },
  assign(reportId: string, assignee: string, team: string) {
    return adminMutation<{ report: { id: string; folio: string; status: string; createdAt: string; location: LocationValue; description: string; area?: string; assigneeId?: string } }>(`/admin/reportes/${reportId}/asignacion`, { assigneeId: assignee, area: team }).then((data) => toReport(data.report));
  },
  scheduleFollowUp(reportId: string, input: FollowUpInput) {
    return adminMutation<ReportRecord>(`/admin/reportes/${reportId}/seguimientos`, input, "POST");
  },
  completeFollowUp(reportId: string, followUpId: string) {
    return adminMutation<ReportRecord>(`/admin/reportes/${reportId}/seguimientos/${followUpId}`, { completed: true });
  },
  addNote(reportId: string, text: string) {
    return adminMutation<{ report: { id: string; folio: string; status: string; createdAt: string; location: LocationValue; description?: string; area?: string; assigneeId?: string } }>(`/admin/reportes/${reportId}`, { note: text }).then((data) => toReport(data.report));
  },
  changePriority(reportId: string, priority: Priority, reason: string) {
    return adminMutation<{ report: { id: string; folio: string; status: string; createdAt: string; location: LocationValue; description?: string; area?: string; assigneeId?: string } }>(`/admin/reportes/${reportId}`, { priority, note: reason }).then((data) => toReport(data.report));
  },
  createMasterIncident(clusterId: string, owner: string) {
    return adminMutation<ProblemCluster>(`/admin/patrones/${clusterId}/incidencia`, { owner }, "POST");
  },
  updateClusterStatus(clusterId: string, status: ProblemCluster["status"]) {
    return adminMutation<ProblemCluster>(`/admin/patrones/${clusterId}/estado`, { status });
  },
  async resetDemoData() {
    throw new Error("Restablecer datos solo está disponible en modo demo.");
  },
};

export const apiServices: Services = { reports, maps, realtime, admin, auth };
