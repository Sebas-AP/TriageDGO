import { randomUUID } from "node:crypto";
import type { AgentLog, AgentTraceEvent, IngestionJob, Principal, Report, ReportCandidate, ReportInput, Ticket, TriageStore } from "../../business/types";

const iso = () => new Date().toISOString();

/** Deterministic adapter used by tests and local development. */
export class InMemoryTriageStore implements TriageStore {
  readonly reports = new Map<string, Report>();
  readonly jobs = new Map<string, IngestionJob>();
  readonly tickets = new Map<string, Ticket>();
  readonly logs: AgentLog[] = [];
  readonly agentTraces = new Map<string, AgentLog>();
  readonly agentTraceEvents = new Map<string, AgentTraceEvent[]>();

  async enqueue(input: ReportInput, principal: Principal, idempotencyKey: string) {
    const existing = [...this.reports.values()].find((r) => r.idempotency_key === `${principal.uid}:${idempotencyKey}`);
    if (existing) {
      const job = [...this.jobs.values()].find((candidate) => candidate.reporte_id === existing.reporte_id)!;
      return { report: existing, job };
    }
    const report: Report = { ...input, reporte_id: randomUUID(), ciudadano_id: principal.uid, created_at: iso(), estado: "encolado", idempotency_key: `${principal.uid}:${idempotencyKey}` };
    const job: IngestionJob = { job_id: randomUUID(), reporte_id: report.reporte_id, estado: "encolado", intentos: 0, available_at: iso() };
    this.reports.set(report.reporte_id, report); this.jobs.set(job.job_id, job);
    return { report, job };
  }
  async getReport(id: string) { return this.reports.get(id); }
  async listReports() { return [...this.reports.values()].sort((a, b) => b.created_at.localeCompare(a.created_at)); }
  async updateReport(id: string, update: Partial<Pick<Report, "area_responsable" | "asignado_a" | "progreso" | "prioridad" | "notas">>) { const report = this.reports.get(id); if (!report) return undefined; Object.assign(report, update); return report; }
  async claimJob(now: Date) {
    const job = [...this.jobs.values()].find((candidate) => ["encolado", "reintento"].includes(candidate.estado) && new Date(candidate.available_at) <= now);
    if (!job) return undefined;
    job.estado = "procesando"; job.intentos += 1; job.lease_until = new Date(now.getTime() + 60_000).toISOString();
    const report = this.reports.get(job.reporte_id); if (report) report.estado = "procesando";
    return { ...job };
  }
  async completeJob(job: IngestionJob, report: Report, ticket?: Ticket) {
    const saved = this.jobs.get(job.job_id)!; saved.estado = report.estado === "revision_manual" ? "revision_manual" : "completado";
    report.ticket_id = ticket?.ticket_id ?? report.ticket_id; this.reports.set(report.reporte_id, report);
  }
  async retryJob(job: IngestionJob, error: string) {
    const saved = this.jobs.get(job.job_id)!;
    if (saved.intentos >= 3) { saved.estado = "revision_manual"; saved.last_error = error; const report = this.reports.get(saved.reporte_id); if (report) report.estado = "revision_manual"; return; }
    saved.estado = "reintento"; saved.last_error = error; saved.available_at = new Date(Date.now() + 1000 * 2 ** saved.intentos).toISOString();
  }
  async createTicket(ticket: Omit<Ticket, "ticket_id" | "created_at">) { const saved: Ticket = { ...ticket, ticket_id: `DUR-${randomUUID().slice(0, 8).toUpperCase()}`, created_at: iso() }; this.tickets.set(saved.ticket_id, saved); return saved; }
  async getTicket(id: string) { return this.tickets.get(id); }
  async findRecentCandidates(report: Report): Promise<ReportCandidate[]> { return [...this.reports.values()].filter((item) => item.reporte_id !== report.reporte_id && item.ticket_id).map((item) => ({ reporte_id: item.reporte_id, texto: item.texto, coordenadas: item.coordenadas, horas_desde_reporte: (Date.now() - new Date(item.created_at).getTime()) / 3_600_000, ticket_id: item.ticket_id })); }
  async linkDuplicate(report: Report, originalReportId: string) { const original = this.reports.get(originalReportId); if (!original?.ticket_id) return undefined; report.duplicado_de = originalReportId; const ticket = this.tickets.get(original.ticket_id)!; ticket.duplicados += 1; ticket.atencion_preferente = ticket.duplicados >= 10; return ticket; }
  async log(entry: AgentLog) { this.logs.push(entry); }
  async startAgentTrace(entry: AgentLog) { this.agentTraces.set(entry.trace_id, { ...entry }); }
  async appendAgentTrace(traceId: string, event: AgentTraceEvent) {
    const events = this.agentTraceEvents.get(traceId) ?? [];
    const parts = splitTraceData(event.data);
    for (const [part, data] of parts.entries()) events.push({ ...event, part, data });
    this.agentTraceEvents.set(traceId, events);
    const trace = this.agentTraces.get(traceId); if (trace) this.agentTraces.set(traceId, { ...trace, event_count: trace.event_count + parts.length });
  }
  async finishAgentTrace(traceId: string, update: Pick<AgentLog, "status" | "duracion_ms"> & Partial<Pick<AgentLog, "error" | "finished_at">>) {
    const trace = this.agentTraces.get(traceId); if (!trace) return;
    const final = { ...trace, ...update }; this.agentTraces.set(traceId, final); this.logs.push(final);
  }
  async isRecurrent(report: Report) { return [...this.reports.values()].filter((r) => r.reporte_id !== report.reporte_id && r.ciudadano_id === report.ciudadano_id && Date.now() - new Date(r.created_at).getTime() < 30 * 86_400_000).length > 0; }
}

const MAX_TRACE_PART_BYTES = 256 * 1024;
function splitTraceData(data: unknown): unknown[] {
  const serialized = JSON.stringify(data);
  if (Buffer.byteLength(serialized, "utf8") <= MAX_TRACE_PART_BYTES) return [data];
  const chunks: string[] = []; let current = ""; let currentBytes = 0;
  for (const char of serialized) {
    const charBytes = Buffer.byteLength(char, "utf8");
    if (currentBytes + charBytes > MAX_TRACE_PART_BYTES) { chunks.push(current); current = char; currentBytes = charBytes; }
    else { current += char; currentBytes += charBytes; }
  }
  if (current) chunks.push(current);
  return chunks.map((chunk, index) => ({ encoding: "json-utf8", chunk, chunks: chunks.length, index }));
}
