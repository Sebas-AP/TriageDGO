import { randomUUID } from "node:crypto";

export interface AdminReportEvent { type: "report.updated"; eventId: string; reportId: string; timestamp: string; areas: string[]; }
type Listener = (event: AdminReportEvent) => void;
/** Process-local event broker. Deploy one broker/instance; reconnecting clients still refresh via REST. */
export class AdminEvents {
  private readonly listeners = new Set<Listener>();
  subscribe(listener: Listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  publish(reportId: string, areas: string[]) { const event: AdminReportEvent = { type: "report.updated", eventId: randomUUID(), reportId, timestamp: new Date().toISOString(), areas }; for (const listener of this.listeners) listener(event); return event; }
}
