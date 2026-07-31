import type { Principal, ReportInput, TriageStore } from "../types";

/** Business boundary for all channel adapters before work reaches the worker. */
export class ReportIngestionService {
  constructor(private readonly store: TriageStore) {}

  enqueue(input: ReportInput, principal: Principal, idempotencyKey: string) {
    return this.store.enqueue(input, principal, idempotencyKey);
  }
}
