import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import type { AgentLog, AgentTraceEvent, IngestionJob, Principal, Report, ReportCandidate, ReportInput, Ticket, TriageStore } from "../../business/types";
import { firestore } from "./firebase";

/** Firestore implementation selected when FIREBASE_PROJECT_ID is configured. */
export class FirestoreTriageStore implements TriageStore {
  private db = firestore();
  async enqueue(input: ReportInput, principal: Principal, key: string) {
    const idempotency_key = `${principal.uid}:${key}`; const existing = await this.db.collection("reportes").where("idempotency_key", "==", idempotency_key).limit(1).get();
    if (!existing.empty) { const report = existing.docs[0].data() as Report; const job = (await this.db.collection("jobs_ingesta").where("reporte_id", "==", report.reporte_id).limit(1).get()).docs[0].data() as IngestionJob; return { report, job }; }
    const reporte_id = randomUUID(), job_id = randomUUID(), now = new Date().toISOString(); const report: Report = { ...input, reporte_id, ciudadano_id: principal.uid, created_at: now, estado: "encolado", idempotency_key }; const job: IngestionJob = { job_id, reporte_id, estado: "encolado", intentos: 0, available_at: now };
    await this.db.batch().set(this.db.collection("reportes").doc(reporte_id), report).set(this.db.collection("jobs_ingesta").doc(job_id), job).commit(); return { report, job };
  }
  async getReport(id: string) { const doc = await this.db.collection("reportes").doc(id).get(); return doc.exists ? doc.data() as Report : undefined; }
  async claimJob(now: Date) { const query = await this.db.collection("jobs_ingesta").where("estado", "in", ["encolado", "reintento"]).where("available_at", "<=", now.toISOString()).orderBy("available_at").limit(1).get(); if (query.empty) return undefined; const doc = query.docs[0]; return await this.db.runTransaction(async tx => { const current = await tx.get(doc.ref); const job = current.data() as IngestionJob; if (!current.exists || !["encolado", "reintento"].includes(job.estado)) return undefined; const claimed = { ...job, estado: "procesando" as const, intentos: job.intentos + 1, lease_until: new Date(now.getTime() + 60_000).toISOString() }; tx.set(doc.ref, claimed); tx.update(this.db.collection("reportes").doc(job.reporte_id), { estado: "procesando" }); return claimed; }); }
  async completeJob(job: IngestionJob, report: Report, ticket?: Ticket) { await this.db.batch().set(this.db.collection("jobs_ingesta").doc(job.job_id), { estado: report.estado === "revision_manual" ? "revision_manual" : "completado" }, { merge: true }).set(this.db.collection("reportes").doc(report.reporte_id), { ...report, ticket_id: ticket?.ticket_id }, { merge: true }).commit(); }
  async retryJob(job: IngestionJob, error: string) { const manual = job.intentos >= 3; await this.db.collection("jobs_ingesta").doc(job.job_id).set({ estado: manual ? "revision_manual" : "reintento", last_error: error.slice(0, 500), available_at: new Date(Date.now() + 2 ** job.intentos * 1000).toISOString() }, { merge: true }); if (manual) await this.db.collection("reportes").doc(job.reporte_id).update({ estado: "revision_manual" }); }
  async createTicket(data: Omit<Ticket, "ticket_id" | "created_at">) { const ticket: Ticket = { ...data, ticket_id: `DUR-${randomUUID().slice(0,8).toUpperCase()}`, created_at: new Date().toISOString() }; await this.db.collection("tickets").doc(ticket.ticket_id).set(ticket); return ticket; }
  async getTicket(id: string) { const doc = await this.db.collection("tickets").doc(id).get(); return doc.exists ? doc.data() as Ticket : undefined; }
  async findRecentCandidates(_report: Report): Promise<ReportCandidate[]> { return []; }
  async linkDuplicate(report: Report, originalId: string) { const original = await this.getReport(originalId); if (!original?.ticket_id) return undefined; const ticket = await this.getTicket(original.ticket_id); if (!ticket) return undefined; ticket.duplicados += 1; ticket.atencion_preferente = ticket.duplicados >= 10; await this.db.batch().update(this.db.collection("reportes").doc(report.reporte_id), { duplicado_de: originalId }).set(this.db.collection("tickets").doc(ticket.ticket_id), ticket).commit(); return ticket; }
  async log(entry: AgentLog) { await this.db.collection("log_agentes").add(entry); }
  async startAgentTrace(entry: AgentLog) { await this.db.collection("log_agentes").doc(entry.trace_id).set(entry); }
  async appendAgentTrace(traceId: string, event: AgentTraceEvent) {
    const parts = splitTraceData(event.data);
    for (let offset = 0; offset < parts.length; offset += 499) {
      const slice = parts.slice(offset, offset + 499);
      const batch = this.db.batch();
      for (let index = 0; index < slice.length; index += 1) {
        const part = offset + index;
        const id = `${String(event.sequence).padStart(8, "0")}-${String(part).padStart(4, "0")}`;
        batch.set(this.db.collection("log_agentes").doc(traceId).collection("eventos").doc(id), { ...event, part, data: slice[index] });
      }
      batch.set(this.db.collection("log_agentes").doc(traceId), { event_count: FieldValue.increment(slice.length) }, { merge: true });
      await batch.commit();
    }
  }
  async finishAgentTrace(traceId: string, update: Pick<AgentLog, "status" | "duracion_ms"> & Partial<Pick<AgentLog, "error" | "finished_at">>) {
    await this.db.collection("log_agentes").doc(traceId).set(update, { merge: true });
  }
  async isRecurrent(_report: Report) { return false; }
}

const MAX_TRACE_PART_BYTES = 256 * 1024;
function splitTraceData(data: unknown): unknown[] {
  const serialized = JSON.stringify(data);
  if (Buffer.byteLength(serialized, "utf8") <= MAX_TRACE_PART_BYTES) return [data];
  const chunks: string[] = [];
  let current = ""; let currentBytes = 0;
  for (const char of serialized) {
    const charBytes = Buffer.byteLength(char, "utf8");
    if (currentBytes + charBytes > MAX_TRACE_PART_BYTES) { chunks.push(current); current = char; currentBytes = charBytes; }
    else { current += char; currentBytes += charBytes; }
  }
  if (current) chunks.push(current);
  return chunks.map((chunk, index) => ({ encoding: "json-utf8", chunk, chunks: chunks.length, index }));
}
