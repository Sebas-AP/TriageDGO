import { cliAgents } from "./agents/cli.gateway";
import { Supervisor } from "./orchestrator/supervisor";
import { geoService } from "./services/geo.service";
import { notificationService } from "./services/notification.service";
import type { TriageStore } from "./types";

export class IngestionWorker {
  constructor(private readonly store: TriageStore, private readonly supervisor = new Supervisor(store, cliAgents, geoService, notificationService)) {}
  async runOnce() { const job = await this.store.claimJob(new Date()); if (!job) return false; const report = await this.store.getReport(job.reporte_id); if (!report) { await this.store.retryJob(job, "report not found"); return true; }
    try { const { ticket } = await this.supervisor.process(report); await this.store.completeJob(job, report, ticket); } catch (error) { await this.store.retryJob(job, error instanceof Error ? error.message : "unknown worker error"); } return true; }
}
