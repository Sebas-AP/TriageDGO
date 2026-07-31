import {
  browserLocalPersistence,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";
import { config } from "../config";
import { firebaseAuth } from "../lib/firebase";
import type {
  AdminEvent,
  AdminUser,
  FollowUpInput,
  LocationValue,
  MapSuggestion,
  OperationalStatus,
  Priority,
  ProblemCluster,
  ReportRecord,
  ReportSubmission,
} from "../types";
import type { AdminService, AuthService, MapService, RealtimeService, ReportService, Services } from "./contracts";

async function responseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: "No fue posible completar la solicitud." }));
    throw new Error(body.message || `Error HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

async function authHeaders(): Promise<HeadersInit> {
  const user = firebaseAuth().currentUser;
  const token = user ? await user.getIdToken() : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function toAdminUser(user: User): AdminUser {
  return { uid: user.uid, email: user.email || "admin", role: "admin" };
}

const reports: ReportService = {
  async submit(input: ReportSubmission) {
    const form = new FormData();
    form.set("citizenName", input.citizenName);
    form.set("phone", input.phone);
    form.set("consent", String(input.consent));
    form.set("description", input.description);
    form.set("location", JSON.stringify(input.location));
    if (input.clarificationAnswer) form.set("clarificationAnswer", input.clarificationAnswer);
    if (input.photo) form.set("photo", input.photo);
    return responseJson(
      await fetch(`${config.apiBaseUrl}/reportes/ingesta`, {
        method: "POST",
        body: form,
      }),
    );
  },
  async requestClarification(description, revision) {
    return responseJson(
      await fetch(`${config.apiBaseUrl}/reportes/clarificacion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description, revision }),
      }),
    );
  },
  async getPublicReport(folio) {
    const response = await fetch(`${config.apiBaseUrl}/reportes/${encodeURIComponent(folio)}`);
    if (response.status === 404) return null;
    return responseJson(response);
  },
};

const maps: MapService = {
  async autocomplete(query, signal) {
    return responseJson<MapSuggestion[]>(
      await fetch(`${config.apiBaseUrl}/maps/autocomplete?q=${encodeURIComponent(query)}`, { signal }),
    );
  },
  async geocode(placeId) {
    return responseJson<LocationValue>(
      await fetch(`${config.apiBaseUrl}/maps/geocode?placeId=${encodeURIComponent(placeId)}`),
    );
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
        listener(JSON.parse(data) as AdminEvent);
        if (id) setLastEventId(id);
      }
    }
  }
}

const realtime: RealtimeService = {
  async listReports() {
    return responseJson<ReportRecord[]>(
      await fetch(`${config.apiBaseUrl}/admin/reportes`, { headers: await authHeaders() }),
    );
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
    return token.claims.admin === true ? toAdminUser(user) : null;
  },
  async login(email, password) {
    const instance = firebaseAuth();
    await setPersistence(instance, browserLocalPersistence);
    const credential = await signInWithEmailAndPassword(instance, email, password);
    const token = await credential.user.getIdTokenResult(true);
    if (token.claims.admin !== true) {
      await signOut(instance);
      throw new Error("La cuenta no tiene permisos de administrador.");
    }
    return toAdminUser(credential.user);
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
      listener(token.claims.admin === true ? toAdminUser(user) : null);
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
  async listClusters() {
    return responseJson<ProblemCluster[]>(
      await fetch(`${config.apiBaseUrl}/admin/patrones`, { headers: await authHeaders() }),
    );
  },
  updateStatus(reportId: string, status: OperationalStatus, note?: string) {
    return adminMutation<ReportRecord>(`/admin/reportes/${reportId}/estado`, { status, note });
  },
  assign(reportId: string, assignee: string, team: string) {
    return adminMutation<ReportRecord>(`/admin/reportes/${reportId}/asignacion`, { assignee, team });
  },
  scheduleFollowUp(reportId: string, input: FollowUpInput) {
    return adminMutation<ReportRecord>(`/admin/reportes/${reportId}/seguimientos`, input, "POST");
  },
  completeFollowUp(reportId: string, followUpId: string) {
    return adminMutation<ReportRecord>(`/admin/reportes/${reportId}/seguimientos/${followUpId}`, { completed: true });
  },
  addNote(reportId: string, text: string) {
    return adminMutation<ReportRecord>(`/admin/reportes/${reportId}/notas`, { text }, "POST");
  },
  changePriority(reportId: string, priority: Priority, reason: string) {
    return adminMutation<ReportRecord>(`/admin/reportes/${reportId}/prioridad`, { priority, reason });
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
