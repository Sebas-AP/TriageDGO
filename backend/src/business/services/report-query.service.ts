import type { TriageStore } from "../types";

/** Read-only business boundary used by public report status adapters. */
export class ReportQueryService {
  constructor(private readonly store: TriageStore) {}

  getPublicStatus(reportId: string) {
    return this.store.getReport(reportId);
  }
}
