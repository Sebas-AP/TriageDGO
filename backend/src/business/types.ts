export const CATEGORIES = [
  "bache", "fuga_agua", "alumbrado_apagado", "semaforo_apagado", "basura_acumulada",
  "cable_caido", "ruido_excesivo", "arbol_riesgoso", "riesgo_seguridad", "drenaje_tapado",
] as const;

export type Category = (typeof CATEGORIES)[number];
export type Urgency = "baja" | "media" | "alta" | "critica";
export type Priority = "P0" | "P1" | "P2" | "P3";
export type Channel = "formulario" | "whatsapp" | "voz";

export interface Principal { uid: string; role: "invitado" | "admin"; areas: string[]; accessLevel?: "operator" | "coordinator"; }
export interface Contact { name?: string; phone?: string; email?: string; consent?: boolean; }
export interface ReportLocation { address?: string; placeId?: string; }
export interface ClarificationAnswer { question: string; answer: string; }
export interface Attachment { storage_path: string; mime_type: string; kind: "foto" | "video" | "audio"; }
export interface ReportInput {
  canal: Channel; texto: string; coordenadas: [number, number]; vulnerable?: boolean;
  adjuntos?: Attachment[]; timestamp?: string; contact?: Contact; location?: ReportLocation; answers?: ClarificationAnswer[];
}
export interface ReportNote { text: string; author_id: string; created_at: string; }
export interface Report extends ReportInput {
  reporte_id: string; ciudadano_id: string; created_at: string; estado: "encolado" | "procesando" | "completado" | "revision_manual";
  idempotency_key: string; ticket_id?: string; duplicado_de?: string; categoria?: Category | "revision_manual"; area_responsable?: string; asignado_a?: string; progreso?: "recibido" | "en_analisis" | "asignado" | "en_atencion" | "resuelto" | "cerrado"; prioridad?: Priority; notas?: ReportNote[]; pattern_detected?: boolean; similares_encontrados?: number; patron_nota?: string; acuse_enviado?: boolean; agent_statuses?: Partial<Record<"classifier" | "pattern" | "acuse", "done" | "error">>;
}
export interface IngestionJob {
  job_id: string; reporte_id: string; estado: "encolado" | "procesando" | "reintento" | "completado" | "revision_manual";
  intentos: number; available_at: string; lease_until?: string; last_error?: string;
}
export interface Ticket {
  ticket_id: string; reporte_id: string; categoria: Category | "revision_manual"; area_responsable: string;
  urgencia_final: Urgency; prioridad_final: Priority; regla_gatillada: string | null;
  revision_manual: boolean; acuse_enviado: boolean; duplicados: number; atencion_preferente: boolean;
  modificadores: string[]; created_at: string; escalado?: boolean; pattern_detected?: boolean; similares_encontrados?: number; patron_nota?: string;
}
export interface AgentLog {
  trace_id: string; timestamp: string; reporte_id: string; agente: string;
  status: "running" | "success" | "schema_error" | "mcp_config_error" | "mcp_initialization_error" | "timeout" | "process_error" | "json_error";
  duracion_ms?: number; intento: number; modelo?: string; error?: string;
  started_at: string; finished_at?: string; event_count: number; events_path: string;
}
export type AgentTraceEventType = "invocation.started" | "process.stdout" | "process.stderr" | "codex.event" | "agent.message" | "mcp.tool_call" | "process.exited" | "agent.final_response" | "agent.failed";
export interface AgentTraceEventInput { type: AgentTraceEventType; data: unknown; timestamp?: string; }
export interface AgentTraceEvent extends AgentTraceEventInput { sequence: number; part: number; }
export interface AgentTraceObserver { emit(event: AgentTraceEventInput): Promise<void>; }
export interface SimilarResult { similares_encontrados: number; muestras: Array<{ reporte_id: string; distancia_km: number }>; }
export interface ReportCandidate { reporte_id: string; texto: string; coordenadas: [number, number]; horas_desde_reporte: number; ticket_id?: string; }
export interface AgentOutputs {
  classifier: { categoria: Category; urgencia_base: Urgency; area_responsable: string; resumen: string; palabras_clave: string[] };
  pattern: { similares_encontrados: number; posible_causa_estructural: boolean; ascenso_sugerido: boolean; nota: string };
  acuse: { mensaje: string };
  evidence?: { corresponde_a_descripcion: boolean; severidad: Urgency; senales_detectadas: string[]; etiqueta_contexto: string };
  dedup?: { duplicado_detectado: boolean; reporte_id_original: string | null; confianza: number; justificacion: string };
}

export interface TriageStore {
  enqueue(input: ReportInput, principal: Principal, idempotencyKey: string): Promise<{ report: Report; job: IngestionJob }>;
  getReport(id: string): Promise<Report | undefined>;
  listReports(): Promise<Report[]>;
  updateReport(id: string, update: Partial<Pick<Report, "area_responsable" | "asignado_a" | "progreso" | "prioridad" | "notas">>): Promise<Report | undefined>;
  claimJob(now: Date): Promise<IngestionJob | undefined>;
  completeJob(job: IngestionJob, report: Report, ticket?: Ticket): Promise<void>;
  retryJob(job: IngestionJob, error: string): Promise<void>;
  createTicket(ticket: Omit<Ticket, "ticket_id" | "created_at">): Promise<Ticket>;
  getTicket(id: string): Promise<Ticket | undefined>;
  findRecentCandidates(report: Report): Promise<ReportCandidate[]>;
  linkDuplicate(report: Report, originalReportId: string): Promise<Ticket | undefined>;
  log(entry: AgentLog): Promise<void>;
  startAgentTrace(entry: AgentLog): Promise<void>;
  appendAgentTrace(traceId: string, event: AgentTraceEvent): Promise<void>;
  finishAgentTrace(traceId: string, update: Pick<AgentLog, "status" | "duracion_ms"> & Partial<Pick<AgentLog, "error" | "finished_at">>): Promise<void>;
  isRecurrent(report: Report): Promise<boolean>;
}
