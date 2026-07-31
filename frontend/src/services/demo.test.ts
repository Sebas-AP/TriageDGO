import { beforeEach, describe, expect, it, vi } from "vitest";
import { demoServices } from "./demo";

describe("servicios demo", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    await demoServices.admin.resetDemoData();
  });

  it("emite el progreso paralelo y crea un ticket", async () => {
    const events: string[] = [];
    const unsubscribe = demoServices.realtime.subscribe((event) => events.push(event.type));

    const result = await demoServices.reports.submit({
      citizenName: "Ana Torres",
      phone: "6181234567",
      consent: true,
      location: { address: "Centro", lat: 24.02, lng: -104.65 },
      description: "Hay un cable caído que bloquea la banqueta.",
    });
    await vi.advanceTimersByTimeAsync(4_000);

    const report = await demoServices.reports.getPublicReport(result.folio);
    expect(events.filter((event) => event === "agent.status")).toHaveLength(6);
    expect(events).toContain("ticket.ready");
    expect(report?.ticket?.priority).toBe("P0");
    unsubscribe();
  });

  it("devuelve una pregunta asociada a la misma revisión", async () => {
    const pending = demoServices.reports.requestClarification(
      "Hay un bache muy grande que bloquea uno de los carriles.",
      4,
    );
    await vi.advanceTimersByTimeAsync(700);
    await expect(pending).resolves.toMatchObject({ revision: 4 });
  });

  it("programa un seguimiento y lo conserva en la gestión del reporte", async () => {
    const report = (await demoServices.realtime.listReports())[0];
    const updated = await demoServices.admin.scheduleFollowUp(report.id, {
      dueAt: new Date(Date.now() + 60_000).toISOString(),
      reason: "Validación con supervisor",
      expectedAction: "Confirmar asignación",
      owner: "Mesa de Control",
    });

    expect(updated.followUps.at(-1)).toMatchObject({
      reason: "Validación con supervisor",
      completed: false,
    });
    expect(updated.auditLog.at(-1)?.type).toBe("follow_up");
  });
});
