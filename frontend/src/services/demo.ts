import type { AdminService, AuthService, MapService, RealtimeService, ReportService, Services } from "./contracts";
import type {
  AuditEvent,
  AdminEvent,
  AdminUser,
  AgentName,
  AgentProgress,
  ChannelSource,
  FollowUpInput,
  LocationValue,
  MapSuggestion,
  OperationalStatus,
  Priority,
  ProblemCluster,
  ReportRecord,
  ReportSubmission,
  Ticket,
} from "../types";

const listeners = new Set<(event: AdminEvent) => void>();
const authListeners = new Set<(user: AdminUser | null) => void>();
const STORAGE_KEY = "triage072-demo-reports-v2";
const CLUSTERS_KEY = "triage072-demo-clusters-v2";
let eventSequence = 0;
let reportSequence = 73;
let demoUser: AdminUser | null = null;

const agentRecord = (): ReportRecord["agents"] => ({
  classifier: { agent: "classifier", status: "pending" },
  pattern: { agent: "pattern", status: "pending" },
  acuse: { agent: "acuse", status: "pending" },
});

const seedReport: ReportRecord = {
  id: "demo-seed-1",
  folio: "DGO-2026-0072",
  citizenName: "María López",
  phone: "6181234567",
  description: "Hay un cable caído frente a la escuela y está sacando chispas.",
  location: { address: "Av. 20 de Noviembre, Zona Centro", lat: 24.0277, lng: -104.6532 },
  status: "ready",
  operationalStatus: "in_progress",
  channel: "whatsapp",
  channelDetails: {
    originalText: "Hay un cable tirado enfrente de la primaria, está aventando chispas",
    mediaCount: 1,
  },
  createdAt: new Date(Date.now() - 12 * 60_000).toISOString(),
  updatedAt: new Date(Date.now() - 4 * 60_000).toISOString(),
  assignee: "Laura Martínez",
  team: "Atención de Riesgos",
  dueAt: new Date(Date.now() + 45 * 60_000).toISOString(),
  agents: {
    classifier: { agent: "classifier", status: "done" },
    pattern: { agent: "pattern", status: "done" },
    acuse: { agent: "acuse", status: "done" },
  },
  ticket: {
    id: "ticket-seed-1",
    folio: "DGO-2026-0072",
    priority: "P0",
    area: "CFE / Servicios Públicos",
    category: "Cable eléctrico caído",
    patternDetected: true,
    triggeredRule: "Riesgo crítico a menos de 500 m de una escuela",
    acknowledgmentSent: true,
    manualReview: false,
  },
  similarReports: [
    { id: "hist-1", category: "Cable caído", coordinates: { lat: 24.029, lng: -104.651 }, distanceKm: 0.24 },
    { id: "hist-2", category: "Alumbrado", coordinates: { lat: 24.0258, lng: -104.655 }, distanceKm: 0.31 },
  ],
  followUps: [],
  notes: [{ id: "note-seed", author: "Mesa de Control", text: "Cuadrilla notificada; se mantiene monitoreo.", createdAt: new Date(Date.now() - 5 * 60_000).toISOString() }],
  auditLog: [
    { id: "audit-1", type: "created", label: "Reporte recibido", detail: "Recibido mediante WhatsApp", actor: "Sistema", createdAt: new Date(Date.now() - 12 * 60_000).toISOString() },
    { id: "audit-2", type: "classified", label: "Clasificación completada", detail: "Cable caído · prioridad P0", actor: "Supervisor IA", createdAt: new Date(Date.now() - 10 * 60_000).toISOString() },
    { id: "audit-3", type: "assigned", label: "Asignado a cuadrilla", detail: "Atención de Riesgos · Laura Martínez", actor: "Mesa de Control", createdAt: new Date(Date.now() - 7 * 60_000).toISOString() },
  ],
  clusterId: "cluster-cables-centro",
};

const sampleCases: Array<{
  description: string;
  category: string;
  area: string;
  priority: Priority;
  channel: ChannelSource;
  operationalStatus: OperationalStatus;
  address: string;
  neighborhood: string;
  offset: [number, number];
  clusterId?: string;
}> = [
  { description: "Fuga constante de agua sobre la calle; ya cubre media cuadra.", category: "Fuga de agua potable", area: "AMD (Agua)", priority: "P1", channel: "call", operationalStatus: "assigned", address: "C. Negrete 804, Centro", neighborhood: "Zona Centro", offset: [0.0012, -0.001], clusterId: "cluster-fugas-centro" },
  { description: "Otra fuga cerca del mercado; el pavimento comienza a hundirse.", category: "Fuga de agua potable", area: "AMD (Agua)", priority: "P1", channel: "whatsapp", operationalStatus: "review", address: "C. Patoni y Negrete, Centro", neighborhood: "Zona Centro", offset: [0.002, -0.0015], clusterId: "cluster-fugas-centro" },
  { description: "Se desperdicia mucha agua desde hace tres días frente al negocio.", category: "Fuga de agua potable", area: "AMD (Agua)", priority: "P2", channel: "form", operationalStatus: "new", address: "C. Pasteur 412, Centro", neighborhood: "Zona Centro", offset: [0.0016, -0.0022], clusterId: "cluster-fugas-centro" },
  { description: "Bache profundo en el carril derecho, varios vehículos han frenado de golpe.", category: "Bache en vialidad", area: "Obras Públicas", priority: "P1", channel: "manual", operationalStatus: "in_progress", address: "Blvd. Dolores del Río 1200", neighborhood: "Barrio de Analco", offset: [-0.003, 0.004], clusterId: "cluster-baches-analco" },
  { description: "Hay tres baches seguidos y uno dañó una llanta esta mañana.", category: "Bache en vialidad", area: "Obras Públicas", priority: "P2", channel: "whatsapp", operationalStatus: "assigned", address: "Blvd. Dolores del Río y Luna", neighborhood: "Barrio de Analco", offset: [-0.0037, 0.0045], clusterId: "cluster-baches-analco" },
  { description: "El pavimento se está desmoronando junto a la parada de camión.", category: "Bache en vialidad", area: "Obras Públicas", priority: "P2", channel: "call", operationalStatus: "resolved", address: "C. Luna 221, Analco", neighborhood: "Barrio de Analco", offset: [-0.0041, 0.0038], clusterId: "cluster-baches-analco" },
  { description: "Semáforo apagado en cruce de mucho tráfico.", category: "Semáforo apagado", area: "Vialidad", priority: "P1", channel: "call", operationalStatus: "new", address: "Av. Cuauhtémoc y 5 de Febrero", neighborhood: "Zona Centro", offset: [0.004, 0.001] },
  { description: "La colonia lleva dos noches sin alumbrado en el parque.", category: "Alumbrado público", area: "Servicios Públicos", priority: "P2", channel: "form", operationalStatus: "review", address: "Parque Sahuatoba", neighborhood: "Los Remedios", offset: [0.006, -0.007] },
  { description: "Árbol inclinado sobre cables después de la tormenta.", category: "Árbol en riesgo", area: "Medio Ambiente", priority: "P1", channel: "whatsapp", operationalStatus: "assigned", address: "C. Fanny Anitúa 905", neighborhood: "Los Ángeles", offset: [0.005, 0.006] },
  { description: "Basura acumulada desde hace una semana en la esquina.", category: "Basura acumulada", area: "Servicios Públicos", priority: "P3", channel: "manual", operationalStatus: "closed", address: "C. Nazas 311", neighborhood: "Valle del Guadiana", offset: [-0.008, -0.006] },
  { description: "Drenaje tapado y olor fuerte cerca de viviendas.", category: "Drenaje tapado", area: "AMD (Drenaje)", priority: "P2", channel: "form", operationalStatus: "in_progress", address: "C. Paloma 121", neighborhood: "Real del Prado", offset: [-0.006, 0.008] },
  { description: "Poste de alumbrado parpadea y hace ruido.", category: "Alumbrado público", area: "Servicios Públicos", priority: "P2", channel: "whatsapp", operationalStatus: "resolved", address: "Av. Tecnológico 404", neighborhood: "Nueva Vizcaya", offset: [0.009, -0.003] },
  { description: "Fuga reparada; se solicita validar que ya no brote agua.", category: "Fuga de agua potable", area: "AMD (Agua)", priority: "P2", channel: "call", operationalStatus: "closed", address: "C. Victoria 510", neighborhood: "Zona Centro", offset: [0.0008, -0.0006], clusterId: "cluster-fugas-centro" },
  { description: "Ruido excesivo durante la madrugada de manera recurrente.", category: "Ruido excesivo", area: "Reglamentos", priority: "P3", channel: "call", operationalStatus: "closed", address: "C. Constitución 208", neighborhood: "Zona Centro", offset: [0.0025, 0.0004] },
  { description: "Cable bajo sobre banqueta, peatones tienen que bajar a la calle.", category: "Cable eléctrico caído", area: "CFE / Servicios Públicos", priority: "P0", channel: "manual", operationalStatus: "review", address: "C. Hidalgo 617", neighborhood: "Zona Centro", offset: [0.0028, -0.0018], clusterId: "cluster-cables-centro" },
  { description: "Coladera sin tapa junto a acceso de primaria.", category: "Riesgo en vía pública", area: "Obras Públicas", priority: "P0", channel: "form", operationalStatus: "assigned", address: "C. Pino Suárez 740", neighborhood: "Zona Centro", offset: [0.0031, -0.003] },
  { description: "Rama grande retirada y área asegurada.", category: "Árbol en riesgo", area: "Medio Ambiente", priority: "P1", channel: "whatsapp", operationalStatus: "closed", address: "C. Laureano Roncal 100", neighborhood: "Zona Centro", offset: [0.001, 0.003] },
  { description: "Bache reparado; falta retirar señalamiento temporal.", category: "Bache en vialidad", area: "Obras Públicas", priority: "P3", channel: "manual", operationalStatus: "resolved", address: "Blvd. Domingo Arrieta 700", neighborhood: "Juan Lira", offset: [-0.01, 0.003] },
];

function makeSampleReport(index: number, sample: (typeof sampleCases)[number]): ReportRecord {
  const ageHours = index < 10 ? index + 1 : (index - 8) * 28;
  const createdAt = new Date(Date.now() - ageHours * 60 * 60_000).toISOString();
  const active = !["resolved", "closed", "duplicate", "cancelled"].includes(sample.operationalStatus);
  const dueAt = active ? new Date(Date.now() + (index % 4 === 0 ? -1 : index + 1) * 60 * 60_000).toISOString() : undefined;
  const id = `demo-report-${index + 2}`;
  const folio = `DGO-2026-${String(71 - index).padStart(4, "0")}`;
  const auditLog: AuditEvent[] = [
    { id: `${id}-created`, type: "created", label: "Reporte recibido", detail: `Canal: ${sample.channel}`, actor: "Sistema", createdAt },
    { id: `${id}-classified`, type: "classified", label: "Clasificación completada", detail: `${sample.category} · ${sample.priority}`, actor: "Supervisor IA", createdAt: new Date(new Date(createdAt).getTime() + 90_000).toISOString() },
  ];
  return {
    id,
    folio,
    citizenName: ["José Ramírez", "Elena Soto", "Carlos Pérez", "Ciudadano anónimo"][index % 4],
    phone: `618123${String(4500 + index).padStart(4, "0")}`,
    description: sample.description,
    location: {
      address: sample.address,
      neighborhood: sample.neighborhood,
      lat: 24.0277 + sample.offset[0],
      lng: -104.6532 + sample.offset[1],
    },
    status: "ready",
    operationalStatus: sample.operationalStatus,
    channel: sample.channel,
    channelDetails:
      sample.channel === "call"
        ? { transcript: sample.description, originalText: "Transcripción normalizada", callDurationSeconds: 48 + index * 7, transcriptionConfidence: 0.91 }
        : sample.channel === "whatsapp"
          ? { originalText: sample.description, mediaCount: index % 2 }
          : sample.channel === "manual"
            ? { capturedBy: "Ventanilla 072" }
            : undefined,
    createdAt,
    updatedAt: new Date(new Date(createdAt).getTime() + 12 * 60_000).toISOString(),
    assignee: active && index % 3 !== 1 ? ["Laura Martínez", "Miguel Torres", "Ana Salas"][index % 3] : undefined,
    team: active && index % 3 !== 1 ? ["Obras Centro", "Agua y Drenaje", "Servicios Norte"][index % 3] : undefined,
    dueAt,
    agents: {
      classifier: { agent: "classifier", status: "done" },
      pattern: { agent: "pattern", status: "done" },
      acuse: { agent: "acuse", status: "done" },
    },
    ticket: {
      id: `ticket-${id}`,
      folio,
      priority: sample.priority,
      originalPriority: sample.priority,
      area: sample.area,
      category: sample.category,
      patternDetected: Boolean(sample.clusterId),
      triggeredRule: sample.clusterId ? "Coincidencia geográfica y temática" : "Matriz de urgencia base",
      acknowledgmentSent: sample.channel !== "manual",
      manualReview: sample.operationalStatus === "review",
    },
    similarReports: [],
    followUps:
      active && index % 4 === 0
        ? [{ id: `follow-${id}`, dueAt: dueAt!, reason: "Requiere inspección presencial", expectedAction: "Confirmar condiciones en sitio", owner: "Mesa de Control", completed: false, createdAt }]
        : [],
    notes: [],
    auditLog,
    clusterId: sample.clusterId,
  };
}

const initialReports = [seedReport, ...sampleCases.map((sample, index) => makeSampleReport(index, sample))];

const initialClusters: ProblemCluster[] = [
  {
    id: "cluster-fugas-centro",
    title: "Fugas recurrentes en Zona Centro",
    category: "Fuga de agua potable",
    zone: "Zona Centro",
    coordinates: { lat: 24.0292, lng: -104.6548 },
    radiusMeters: 420,
    reportIds: initialReports.filter((report) => report.clusterId === "cluster-fugas-centro").map((report) => report.id),
    reportCount: 12,
    trend: "growing",
    growthPercent: 58,
    highestPriority: "P1",
    probableCause: "Posible afectación en la línea principal de distribución.",
    status: "investigating",
    owner: "AMD · Agua y Drenaje",
    firstSeenAt: new Date(Date.now() - 18 * 24 * 60 * 60_000).toISOString(),
    lastSeenAt: new Date(Date.now() - 55 * 60_000).toISOString(),
    channelCounts: { form: 3, whatsapp: 5, call: 3, manual: 1 },
  },
  {
    id: "cluster-baches-analco",
    title: "Deterioro vial en corredor Analco",
    category: "Bache en vialidad",
    zone: "Barrio de Analco",
    coordinates: { lat: 24.0241, lng: -104.649 },
    radiusMeters: 360,
    reportIds: initialReports.filter((report) => report.clusterId === "cluster-baches-analco").map((report) => report.id),
    reportCount: 8,
    trend: "stable",
    growthPercent: 8,
    highestPriority: "P1",
    probableCause: "Desgaste acelerado por escurrimientos y tránsito pesado.",
    status: "action_planned",
    owner: "Obras Centro",
    firstSeenAt: new Date(Date.now() - 24 * 24 * 60 * 60_000).toISOString(),
    lastSeenAt: new Date(Date.now() - 3 * 60 * 60_000).toISOString(),
    masterIncidentFolio: "INC-2026-0014",
    channelCounts: { form: 2, whatsapp: 3, call: 2, manual: 1 },
  },
  {
    id: "cluster-cables-centro",
    title: "Riesgo eléctrico cerca de escuelas",
    category: "Cable eléctrico caído",
    zone: "Zona Centro",
    coordinates: { lat: 24.0295, lng: -104.6546 },
    radiusMeters: 480,
    reportIds: initialReports.filter((report) => report.clusterId === "cluster-cables-centro").map((report) => report.id),
    reportCount: 5,
    trend: "growing",
    growthPercent: 34,
    highestPriority: "P0",
    probableCause: "Daño en infraestructura aérea posterior a tormenta.",
    status: "detected",
    firstSeenAt: new Date(Date.now() - 5 * 24 * 60 * 60_000).toISOString(),
    lastSeenAt: new Date(Date.now() - 12 * 60_000).toISOString(),
    channelCounts: { form: 1, whatsapp: 2, call: 1, manual: 1 },
  },
];

function loadReports() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? (JSON.parse(stored) as ReportRecord[]) : initialReports;
  } catch {
    return initialReports;
  }
}

function loadClusters() {
  try {
    const stored = localStorage.getItem(CLUSTERS_KEY);
    return stored ? (JSON.parse(stored) as ProblemCluster[]) : initialClusters;
  } catch {
    return initialClusters;
  }
}

const reports = new Map<string, ReportRecord>(loadReports().map((report) => [report.id, report]));
let clusters = loadClusters();
const syncChannel =
  typeof window !== "undefined" && typeof window.BroadcastChannel !== "undefined"
    ? new window.BroadcastChannel("triage072-demo-sync")
    : null;

function persist() {
  const snapshot = [...reports.values()];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  localStorage.setItem(CLUSTERS_KEY, JSON.stringify(clusters));
  syncChannel?.postMessage({ reports: snapshot, clusters });
}

syncChannel?.addEventListener("message", (event: MessageEvent<{ reports: ReportRecord[]; clusters: ProblemCluster[] }>) => {
  reports.clear();
  event.data.reports.forEach((report) => reports.set(report.id, report));
  clusters = event.data.clusters;
  event.data.reports.forEach((report) => {
    const update: AdminEvent = {
      eventId: `sync-${report.id}-${Date.now()}`,
      reportId: report.id,
      timestamp: new Date().toISOString(),
      type: "report.updated",
      payload: report,
    };
    listeners.forEach((listener) => listener(update));
  });
});

function emit(reportId: string, type: AdminEvent["type"], payload: AdminEvent["payload"]) {
  const event = {
    eventId: `demo-event-${++eventSequence}`,
    reportId,
    timestamp: new Date().toISOString(),
    type,
    payload,
  } as AdminEvent;
  persist();
  listeners.forEach((listener) => listener(event));
}

function schedulePipeline(report: ReportRecord) {
  const agents: AgentName[] = ["classifier", "pattern", "acuse"];
  agents.forEach((agent, index) => {
    window.setTimeout(() => {
      const progress: AgentProgress = { agent, status: "running" };
      report.agents[agent] = progress;
      report.status = "processing";
      emit(report.id, "agent.status", progress);
    }, 450 + index * 280);
    window.setTimeout(() => {
      const progress: AgentProgress = { agent, status: "done" };
      report.agents[agent] = progress;
      emit(report.id, "agent.status", progress);
    }, 1450 + index * 520);
  });

  window.setTimeout(() => {
    const isCable = report.description.toLowerCase().includes("cable");
    const ticket: Ticket = {
      id: `ticket-${report.id}`,
      folio: report.folio,
      priority: isCable ? "P0" : "P2",
      originalPriority: isCable ? "P0" : "P2",
      area: isCable ? "CFE / Servicios Públicos" : "Obras Públicas",
      category: isCable ? "Cable eléctrico caído" : "Bache en vialidad",
      patternDetected: true,
      triggeredRule: "Patrón recurrente detectado",
      acknowledgmentSent: true,
      manualReview: false,
    };
    report.ticket = ticket;
    report.status = "ready";
    report.similarReports = [
      {
        id: `similar-${report.id}`,
        category: ticket.category,
        coordinates: { lat: report.location.lat + 0.002, lng: report.location.lng - 0.001 },
        distanceKm: 0.27,
      },
    ];
    emit(report.id, "ticket.ready", ticket);
  }, 3500);
}

const suggestions: Array<MapSuggestion & LocationValue> = [
  {
    placeId: "centro-dgo",
    label: "Plaza de Armas, Zona Centro",
    context: "Victoria de Durango, Dgo.",
    address: "Plaza de Armas, Zona Centro, Durango",
    lat: 24.0252,
    lng: -104.6535,
  },
  {
    placeId: "20-noviembre",
    label: "Avenida 20 de Noviembre",
    context: "Zona Centro, Durango",
    address: "Av. 20 de Noviembre, Zona Centro, Durango",
    lat: 24.0277,
    lng: -104.6532,
  },
  {
    placeId: "fenadu",
    label: "Feria Nacional Durango",
    context: "Carretera Durango–Mezquital",
    address: "FENADU, Durango",
    lat: 23.9916,
    lng: -104.6694,
  },
];

const reportService: ReportService = {
  async submit(input: ReportSubmission) {
    reportSequence += 1;
    const id = crypto.randomUUID();
    const folio = `DGO-2026-${String(reportSequence).padStart(4, "0")}`;
    const report: ReportRecord = {
      id,
      folio,
      citizenName: input.citizenName,
      phone: input.phone,
      description: input.description,
      location: input.location,
      status: "received",
      operationalStatus: "new",
      channel: "form",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      agents: agentRecord(),
      similarReports: [],
      followUps: [],
      notes: [],
      auditLog: [
        {
          id: `audit-${id}`,
          type: "created",
          label: "Reporte recibido",
          detail: "Enviado desde el formulario ciudadano",
          actor: "Sistema",
          createdAt: new Date().toISOString(),
        },
      ],
    };
    reports.set(id, report);
    emit(id, "report.received", report);
    schedulePipeline(report);
    return { reportId: id, folio, status: "received" };
  },
  async requestClarification(input, revision) {
    const description = typeof input === "string" ? input : input.description || "";
    await new Promise((resolve) => window.setTimeout(resolve, 650));
    if (typeof input !== "string" && input.sessionId) return { sessionId: input.sessionId, complete: true, questions: [] };
    return {
      sessionId: "demo-clarification",
      complete: description.trim().length <= 25,
      questions: description.trim().length > 25 ? ["¿El problema obstruye por completo el paso o todavía se puede circular con precaución?"] : [],
    };
  },
  async getPublicReport(folio) {
    return [...reports.values()].find((report) => report.folio === folio) ?? null;
  },
  async listMine() {
    return [...reports.values()].filter((report) => report.channel === "form");
  },
  async getMine(reportId) {
    return reports.get(reportId) ?? null;
  },
};

const mapService: MapService = {
  async autocomplete(query, signal) {
    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(resolve, 180);
      signal?.addEventListener("abort", () => {
        window.clearTimeout(timeout);
        reject(new DOMException("Aborted", "AbortError"));
      });
    });
    const normalized = query.toLowerCase();
    return suggestions.filter((item) => `${item.label} ${item.context}`.toLowerCase().includes(normalized));
  },
  async geocode(placeId) {
    const item = suggestions.find((candidate) => candidate.placeId === placeId);
    if (!item) throw new Error("No se encontró la ubicación seleccionada.");
    return { address: item.address, lat: item.lat, lng: item.lng, placeId: item.placeId };
  },
};

const realtimeService: RealtimeService = {
  async listReports() {
    return [...reports.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

function getReport(reportId: string) {
  const report = reports.get(reportId);
  if (!report) throw new Error("No se encontró el reporte.");
  return report;
}

function audit(report: ReportRecord, event: Omit<AuditEvent, "id" | "createdAt">) {
  report.updatedAt = new Date().toISOString();
  report.auditLog = [
    ...report.auditLog,
    { ...event, id: crypto.randomUUID(), createdAt: report.updatedAt },
  ];
}

function publishUpdate(report: ReportRecord) {
  persist();
  emit(report.id, "report.updated", { ...report });
  return { ...report };
}

const adminService: AdminService = {
  async listUsers() { return [{ uid: "demo-admin", email: "admin@demo.local", name: "Mesa de Control", role: "admin" as const, accessLevel: "coordinator" as const, areas: ["agua", "obras"], active: true }]; },
  async createUser(input) { return { uid: crypto.randomUUID(), role: "admin", active: true, ...input }; },
  async setUserActive(userId, active) { return { uid: userId, email: "demo@local", name: "Cuenta demo", role: "admin", accessLevel: "operator", areas: [], active }; },
  async listClusters() {
    return [...clusters].sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt));
  },
  async updateStatus(reportId, status, note) {
    const report = getReport(reportId);
    report.operationalStatus = status;
    if (status === "resolved" || status === "closed") {
      report.followUps = report.followUps.map((followUp) => ({ ...followUp, completed: true }));
    }
    audit(report, {
      type: "status",
      label: `Estado actualizado a ${status}`,
      detail: note || "Actualización desde Mesa de Control",
      actor: "Administrador 072",
    });
    return publishUpdate(report);
  },
  async assign(reportId, assignee, team) {
    const report = getReport(reportId);
    report.assignee = assignee;
    report.team = team;
    if (report.operationalStatus === "new" || report.operationalStatus === "review") {
      report.operationalStatus = "assigned";
    }
    audit(report, {
      type: "assigned",
      label: "Responsable asignado",
      detail: `${team} · ${assignee}`,
      actor: "Administrador 072",
    });
    return publishUpdate(report);
  },
  async scheduleFollowUp(reportId, input: FollowUpInput) {
    const report = getReport(reportId);
    report.followUps = [
      ...report.followUps,
      { ...input, id: crypto.randomUUID(), completed: false, createdAt: new Date().toISOString() },
    ];
    report.dueAt = input.dueAt;
    audit(report, {
      type: "follow_up",
      label: "Seguimiento programado",
      detail: `${input.reason} · ${new Date(input.dueAt).toLocaleString("es-MX")}`,
      actor: "Administrador 072",
    });
    return publishUpdate(report);
  },
  async completeFollowUp(reportId, followUpId) {
    const report = getReport(reportId);
    report.followUps = report.followUps.map((followUp) =>
      followUp.id === followUpId ? { ...followUp, completed: true } : followUp,
    );
    audit(report, {
      type: "follow_up",
      label: "Seguimiento completado",
      detail: "La actividad programada fue atendida.",
      actor: "Administrador 072",
    });
    return publishUpdate(report);
  },
  async addNote(reportId, text) {
    const report = getReport(reportId);
    report.notes = [
      ...report.notes,
      { id: crypto.randomUUID(), author: "Administrador 072", text, createdAt: new Date().toISOString() },
    ];
    audit(report, {
      type: "note",
      label: "Nota interna agregada",
      detail: text,
      actor: "Administrador 072",
    });
    return publishUpdate(report);
  },
  async changePriority(reportId, priority, reason) {
    const report = getReport(reportId);
    if (!report.ticket) throw new Error("El reporte aún no tiene ticket.");
    const previous = report.ticket.priority;
    report.ticket = { ...report.ticket, priority };
    audit(report, {
      type: "priority",
      label: `Prioridad modificada ${previous} → ${priority}`,
      detail: reason,
      actor: "Administrador 072",
    });
    return publishUpdate(report);
  },
  async createMasterIncident(clusterId, owner) {
    const cluster = clusters.find((item) => item.id === clusterId);
    if (!cluster) throw new Error("No se encontró el problema frecuente.");
    cluster.masterIncidentFolio = `INC-2026-${String(15 + clusters.filter((item) => item.masterIncidentFolio).length).padStart(4, "0")}`;
    cluster.owner = owner;
    cluster.status = "action_planned";
    cluster.reportIds.forEach((reportId) => {
      const report = reports.get(reportId);
      if (report) {
        audit(report, {
          type: "linked",
          label: `Vinculado a ${cluster.masterIncidentFolio}`,
          detail: cluster.title,
          actor: "Administrador 072",
        });
      }
    });
    persist();
    return { ...cluster };
  },
  async updateClusterStatus(clusterId, status) {
    const cluster = clusters.find((item) => item.id === clusterId);
    if (!cluster) throw new Error("No se encontró el problema frecuente.");
    cluster.status = status;
    persist();
    return { ...cluster };
  },
  async resetDemoData() {
    reports.clear();
    initialReports.forEach((report) => reports.set(report.id, structuredClone(report)));
    clusters = structuredClone(initialClusters);
    persist();
  },
};

const authService: AuthService = {
  async currentUser() {
    return demoUser;
  },
  async login(email) {
    demoUser = { uid: "demo-admin", email: email || "admin@demo.local", role: "admin", accessLevel: "coordinator", areas: ["agua", "obras", "servicios"] };
    authListeners.forEach((listener) => listener(demoUser));
    return demoUser;
  },
  async logout() {
    demoUser = null;
    authListeners.forEach((listener) => listener(null));
  },
  async getToken() {
    return demoUser ? "demo-token" : null;
  },
  onChange(listener) {
    authListeners.add(listener);
    return () => authListeners.delete(listener);
  },
};

export const demoServices: Services = {
  reports: reportService,
  maps: mapService,
  realtime: realtimeService,
  admin: adminService,
  auth: authService,
};
