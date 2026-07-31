import { cliAgents } from "./agents/cli.gateway";
import { Supervisor } from "./orchestrator/supervisor";
import { geoService } from "./services/geo.service";
import { notificationService } from "./services/notification.service";
import type { TriageStore } from "./types";

export interface RagIndexer { indexarReporte(reporteId: string, token: string): Promise<unknown>; }

export class IngestionWorker {
  constructor(private readonly store: TriageStore, private readonly supervisor = new Supervisor(store, cliAgents, geoService, notificationService), private readonly rag?: RagIndexer) {}
  async runOnce() { const job = await this.store.claimJob(new Date()); if (!job) return false; const report = await this.store.getReport(job.reporte_id); if (!report) { await this.store.retryJob(job, "report not found"); return true; }
    try {
      const { ticket } = await this.supervisor.process(report); await this.store.completeJob(job, report, ticket);
      if (report.estado === "completado" && this.rag && process.env.RAG_INTERNAL_TOKEN) {
        try { await this.rag.indexarReporte(report.reporte_id, process.env.RAG_INTERNAL_TOKEN); }
        catch { /* The service rebuilds from Firestore; never roll back a confirmed ticket. */ }
      }
    } catch (error) { await this.store.retryJob(job, error instanceof Error ? error.message : "unknown worker error"); } return true; }
}
