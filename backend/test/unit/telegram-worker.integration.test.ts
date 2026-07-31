import { describe, expect, it, vi } from "vitest";

import { IngestionWorker } from "../../src/business/worker";
import type { Supervisor } from "../../src/business/orchestrator/supervisor";
import type { TicketNotifier } from "../../src/business/services/telegram-notification.service";
import type { Ticket } from "../../src/business/types";
import { InMemoryTriageStore } from "../../src/data/firestore/triage.store";

const ticket: Ticket = {
  ticket_id: "DUR-BACHE", reporte_id: "pending", categoria: "bache", area_responsable: "Obras Públicas",
  urgencia_final: "media", prioridad_final: "P2", regla_gatillada: null, revision_manual: false,
  acuse_enviado: true, duplicados: 0, atencion_preferente: false, modificadores: [], created_at: "2026-07-31T06:00:00.000Z",
};

async function setup(notify: TicketNotifier["notify"]) {
  const store = new InMemoryTriageStore();
  const { report, job } = await store.enqueue(
    { canal: "formulario", texto: "Bache profundo", coordenadas: [24.02, -104.65] },
    { uid: "cit-1", role: "invitado", areas: [] },
    "telegram-worker-test",
  );
  const finalTicket = { ...ticket, reporte_id: report.reporte_id };
  const supervisor = { process: vi.fn(async () => ({ ticket: finalTicket })) } as unknown as Supervisor;
  const notifier: TicketNotifier = { notify };
  return { store, report, job, finalTicket, worker: new IngestionWorker(store, supervisor, undefined, notifier) };
}

describe("IngestionWorker + Telegram", () => {
  it("notifica después de persistir el ticket", async () => {
    const notify = vi.fn<TicketNotifier["notify"]>(async () => [{ destination: "baches", status: "sent", messageId: 9 }]);
    const context = await setup(notify);

    await expect(context.worker.runOnce()).resolves.toBe(true);

    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ reporte_id: context.report.reporte_id }), context.finalTicket);
    expect(context.store.jobs.get(context.job.job_id)?.estado).toBe("completado");
    expect(context.store.reports.get(context.report.reporte_id)?.ticket_id).toBe("DUR-BACHE");
  });

  it("una caída de Telegram no revierte el ticket", async () => {
    const notify = vi.fn<TicketNotifier["notify"]>(async () => { throw new Error("telegram offline"); });
    const context = await setup(notify);

    await expect(context.worker.runOnce()).resolves.toBe(true);

    expect(context.store.jobs.get(context.job.job_id)?.estado).toBe("completado");
    expect(context.store.reports.get(context.report.reporte_id)?.ticket_id).toBe("DUR-BACHE");
  });
});
