import { arbitrate } from "../rules/arbitration.rules";
import { randomUUID } from "node:crypto";
import type { AgentLog, AgentOutputs, AgentTraceEventInput, AgentTraceObserver, Report, Ticket, TriageStore, Urgency } from "../types";

/** Gateway interface for invoking reasoning agents. */
export interface AgentGateway {
  classifier(report: Report, trace?: AgentTraceObserver): Promise<AgentOutputs["classifier"]>;
  pattern(report: Report, trace?: AgentTraceObserver): Promise<AgentOutputs["pattern"]>;
  acuse(report: Report, trace?: AgentTraceObserver): Promise<AgentOutputs["acuse"]>;
  evidence(report: Report, trace?: AgentTraceObserver): Promise<NonNullable<AgentOutputs["evidence"]>>;
  dedup(report: Report, candidates: unknown[], trace?: AgentTraceObserver): Promise<NonNullable<AgentOutputs["dedup"]>>;
  escalation(ticket: Ticket, school: string, trace?: AgentTraceObserver): Promise<{ debe_escalar: boolean }>;
}

/** Gateway interface for geolocation services. */
export interface GeoGateway {
  schoolNear(coordinates: [number, number]): Promise<string | undefined>;
  weatherAggravates(report: Report): Promise<boolean>;
}

/** Callback for sending citizen acknowledgments. */
export type AcuseSender = (report: Report, message: string, ticketId: string) => Promise<boolean | void>;

const fallback = {
  categoria: "revision_manual" as const,
  urgencia_base: "alta" as Urgency,
  area_responsable: "revision_manual",
  resumen: "Clasificación pendiente",
  palabras_clave: []
};

interface StartedAgentTask {
  agent: string;
  startedAt: number;
  traceId: string;
  observer: BufferedTraceObserver;
  promise: Promise<unknown>;
}

class BufferedTraceObserver implements AgentTraceObserver {
  private sequence = 0;
  private writes = Promise.resolve();
  constructor(private readonly store: TriageStore, private readonly traceId: string) {}
  emit(event: AgentTraceEventInput): Promise<void> {
    this.sequence += 1;
    const record = { ...event, sequence: this.sequence, part: 0, timestamp: event.timestamp ?? new Date().toISOString() };
    this.writes = this.writes.then(() => this.store.appendAgentTrace(this.traceId, record)).catch(() => undefined);
    return this.writes;
  }
  async flush() { await this.writes; }
}

/**
 * Orchestrates parallel execution of reasoning agents and applies arbitration rules.
 *
 * Flow:
 * 1. Launch classifier, pattern, acuse, dedup (and evidence if attachments) in parallel
 * 2. Wait for all agents with Promise.allSettled (fault-tolerant)
 * 3. Handle duplicates (link to original if detected)
 * 4. Apply arbitration rules → final urgency/priority
 * 5. Create ticket and send acknowledgment
 * 6. Escalate if critical + near school
 */
export class Supervisor {
  constructor(
    private readonly store: TriageStore,
    private readonly agents: AgentGateway,
    private readonly geo: GeoGateway,
    private readonly sendAcuse: AcuseSender
  ) {}

  /**
   * Processes a report through the full agent pipeline.
   *
   * @param report - The report to process
   * @returns The created ticket
   */
  async process(report: Report): Promise<{ ticket: Ticket }> {
    const candidates = await this.store.findRecentCandidates(report);
    const tasks = await Promise.all([
      this.start(report, "classifier", (trace) => this.agents.classifier(report, trace)),
      this.start(report, "pattern", (trace) => this.agents.pattern(report, trace)),
      this.start(report, "acuse", (trace) => this.agents.acuse(report, trace)),
      this.start(report, "dedup", (trace) => this.agents.dedup(report, candidates, trace)),
      ...(report.adjuntos?.length ? [this.start(report, "evidence", (trace) => this.agents.evidence(report, trace))] : []),
    ]);
    const settled = await Promise.allSettled(tasks.map((task) => task.promise));
    await Promise.all(settled.map((entry, i) => this.log(report, tasks[i], entry)));
    report.agent_statuses = {
      classifier: settled[0]?.status === "fulfilled" ? "done" : "error",
      pattern: settled[1]?.status === "fulfilled" ? "done" : "error",
      acuse: settled[2]?.status === "fulfilled" ? "done" : "error",
    };
    const failed = settled.some((entry) => entry.status === "rejected");
    const value = <T>(i: number): T | undefined => settled[i]?.status === "fulfilled" ? settled[i].value as T : undefined;
    const classifier = value<AgentOutputs["classifier"]>(0) ?? fallback;
    const pattern = value<AgentOutputs["pattern"]>(1) ?? { similares_encontrados: 0, posible_causa_estructural: false, ascenso_sugerido: false, nota: "No disponible" };
    const verifiedPattern = { ...pattern, posible_causa_estructural: pattern.posible_causa_estructural && pattern.similares_encontrados > 0 };
    const acuse = value<AgentOutputs["acuse"]>(2);
    const dedup = value<NonNullable<AgentOutputs["dedup"]>>(3);
    if (dedup?.duplicado_detectado && dedup.reporte_id_original) {
      const original = await this.store.linkDuplicate(report, dedup.reporte_id_original);
      if (original) { report.estado = failed ? "revision_manual" : "completado"; if (acuse) await this.sendAcuse(report, acuse.mensaje, original.ticket_id); return { ticket: original }; }
    }
    const school = await this.geo.schoolNear(report.coordenadas);
    const modifier = !school && ((await this.store.isRecurrent(report)) || Boolean(report.vulnerable) || await this.geo.weatherAggravates(report));
    const arbitration = classifier.categoria === "revision_manual" ? { urgencia_final: "alta" as Urgency, prioridad_final: "P1" as const, regla_gatillada: null } : arbitrate({ categoria: classifier.categoria, urgencia: classifier.urgencia_base, similares: verifiedPattern.similares_encontrados, causaEstructural: verifiedPattern.posible_causa_estructural, cercaEscuela: Boolean(school), modifier });
    const ticket = await this.store.createTicket({ reporte_id: report.reporte_id, categoria: classifier.categoria, area_responsable: canonicalArea(classifier.categoria), ...arbitration, revision_manual: failed || classifier.categoria === "revision_manual", acuse_enviado: false, duplicados: 0, atencion_preferente: false, modificadores: modifier ? ["modificador"] : [], pattern_detected: verifiedPattern.posible_causa_estructural, similares_encontrados: verifiedPattern.similares_encontrados, patron_nota: verifiedPattern.nota });
    if (acuse) ticket.acuse_enviado = (await this.sendAcuse(report, acuse.mensaje, ticket.ticket_id)) === true;
    if (school && ticket.urgencia_final === "critica") { const escalation = await this.agents.escalation(ticket, school); ticket.escalado = escalation.debe_escalar; }
    report.estado = ticket.revision_manual ? "revision_manual" : "completado";
    report.ticket_id = ticket.ticket_id;
    report.categoria = ticket.categoria;
    report.area_responsable = canonicalArea(ticket.categoria);
    report.prioridad = ticket.prioridad_final;
    report.pattern_detected = ticket.pattern_detected;
    report.similares_encontrados = ticket.similares_encontrados;
    report.patron_nota = ticket.patron_nota;
    report.acuse_enviado = ticket.acuse_enviado;
    report.agent_conclusions = {
      classifier: classifier.resumen,
      pattern: ticket.patron_nota,
      ...(acuse ? { acuse: acuse.mensaje } : {}),
    };
    return { ticket };
  }
  private async start(report: Report, agent: string, operation: (trace: AgentTraceObserver) => Promise<unknown>): Promise<StartedAgentTask> {
    const traceId = randomUUID(); const startedAt = Date.now(); const observer = new BufferedTraceObserver(this.store, traceId);
    const trace: AgentLog = { trace_id: traceId, timestamp: new Date(startedAt).toISOString(), started_at: new Date(startedAt).toISOString(), reporte_id: report.reporte_id, agente: agent, status: "running", intento: 1, modelo: process.env.CODEX_MODEL ?? "gpt-5.6-luna", event_count: 0, events_path: `log_agentes/${traceId}/eventos` };
    try { await this.store.startAgentTrace(trace); } catch { /* Observability is never a business failure. */ }
    return { agent, startedAt, traceId, observer, promise: Promise.resolve().then(() => operation(observer)) };
  }
  private async log(report: Report, task: StartedAgentTask, entry: PromiseSettledResult<unknown>) {
    const error = entry.status === "rejected" ? this.errorMessage(entry.reason) : undefined;
    const finishedAt = new Date().toISOString(); const duration = Math.max(0, Date.now() - task.startedAt); const status = entry.status === "fulfilled" ? "success" : this.errorStatus(error ?? "agent failed");
    await task.observer.flush();
    try { await this.store.finishAgentTrace(task.traceId, { status, duracion_ms: duration, finished_at: finishedAt, ...(error ? { error } : {}) }); } catch { /* Observability is never a business failure. */ }
  }
  private errorMessage(reason: unknown): string {
    return reason instanceof Error ? reason.message : "agent failed";
  }
  private errorStatus(error: string): Exclude<AgentLog["status"], "success"> {
    const message = error.toLowerCase();
    if (/(--json-schema|--output-schema|json schema|\$schema)/.test(message)) return "schema_error";
    if (/(mcp configuration|mcpservers|mcp_servers|--mcp-config)/.test(message)) return "mcp_config_error";
    if (/(mcp.*(?:handshake|initialize|initializ|connection closed|required mcp servers)|(?:handshake|initialize).*mcp)/.test(message)) return "mcp_initialization_error";
    if (/(timed out|\btimeout\b|etimedout)/.test(message)) return "timeout";
    if (/(unexpected token.*json|json.*(?:parse|invalid|malformed)|syntaxerror)/.test(message)) return "json_error";
    return "process_error";
  }
}

function canonicalArea(category: Ticket["categoria"]): string {
  return {
    bache: "Obras Públicas",
    fuga_agua: "AMD (Agua)",
    alumbrado_apagado: "Servicios Públicos",
    semaforo_apagado: "Vialidad",
    basura_acumulada: "Servicios Públicos",
    cable_caido: "CFE / SP",
    ruido_excesivo: "Reglamentos",
    arbol_riesgoso: "Medio Ambiente",
    riesgo_seguridad: "Seguridad Pública",
    drenaje_tapado: "AMD (Drenaje)",
    revision_manual: "revision_manual",
  }[category];
}
