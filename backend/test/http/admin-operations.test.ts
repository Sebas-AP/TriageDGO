import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import { InMemoryTriageStore } from "../../src/data/firestore/triage.store";

describe("admin operational API", () => {
  it("returns detail and allows an assigned operator to progress a report with a note", async () => {
    const store = new InMemoryTriageStore();
    const citizen = createApp({ store, authenticate: async () => ({ uid: "c", role: "invitado" as const, areas: [] }) });
    const created = await request(citizen).post("/reportes/ingesta").set("Authorization", "Bearer x").send({ canal: "formulario", texto: "Bache", coordenadas: [24, -104] });
    const coord = createApp({ store, authenticate: async () => ({ uid: "coord", role: "admin" as const, areas: ["obras"], accessLevel: "coordinator" as const }) });
    await request(coord).patch(`/admin/reportes/${created.body.reportId}/asignacion`).send({ assigneeId: "op", area: "obras" });
    const op = createApp({ store, authenticate: async () => ({ uid: "op", role: "admin" as const, areas: ["obras"], accessLevel: "operator" as const }) });
    expect((await request(op).patch(`/admin/reportes/${created.body.reportId}`).send({ progress: "en_atencion", note: "Cuadrilla notificada", priority: "P1" })).status).toBe(200);
    const detail = await request(op).get(`/admin/reportes/${created.body.reportId}`);
    expect(detail.body.report).toMatchObject({ progress: "en_atencion", priority: "P1", notes: [{ text: "Cuadrilla notificada", authorId: "op" }] });
  });

  it("exposes deterministic map fallback", async () => {
    const app = createApp();
    expect((await request(app).get("/mapas/geocodificar?address=nada")).body).toEqual({ result: null, provider: "fallback" });
  });
});
