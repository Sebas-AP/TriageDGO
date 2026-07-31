import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/app";
import { InMemoryTriageStore } from "../../src/data/firestore/triage.store";

describe("UI API", () => {
  it("keeps a citizen's reports private and exposes the stored form location", async () => {
    const store = new InMemoryTriageStore();
    const app = createApp({ store, authenticate: async () => ({ uid: "citizen-a", role: "invitado", areas: [] }) });
    const created = await request(app).post("/reportes/ingesta").set("Authorization", "Bearer guest-token").send({ canal: "formulario", texto: "Bache", coordenadas: [24, -104], contact: { name: "Ana", phone: "6181111111", consent: true }, location: { address: "Hidalgo 1", placeId: "place-a" }, answers: [{ question: "¿Qué tamaño?", answer: "No lo sé" }] });
    const mine = await request(app).get("/ciudadano/reportes");
    expect(mine.status).toBe(200);
    expect(mine.body.reports).toHaveLength(1);
    expect(mine.body.reports[0]).toMatchObject({ id: created.body.reportId, status: "received", location: { address: "Hidalgo 1", lat: 24, lng: -104 } });
    expect(mine.body.reports[0]).not.toHaveProperty("contact");
  });

  it("restricts operator reports to their assignment and lets a coordinator assign", async () => {
    const store = new InMemoryTriageStore();
    const citizen = createApp({ store, authenticate: async () => ({ uid: "citizen", role: "invitado", areas: [] }) });
    const created = await request(citizen).post("/reportes/ingesta").set("Authorization", "Bearer guest-token").send({ canal: "formulario", texto: "Fuga", coordenadas: [24, -104] });
    const coordinator = createApp({ store, authenticate: async () => ({ uid: "coord", role: "admin", areas: ["agua"], accessLevel: "coordinator" }) });
    expect((await request(coordinator).patch(`/admin/reportes/${created.body.reportId}/asignacion`).send({ assigneeId: "operator", area: "agua" })).status).toBe(200);
    const operator = createApp({ store, authenticate: async () => ({ uid: "operator", role: "admin", areas: ["agua"], accessLevel: "operator" }) });
    expect((await request(operator).get("/admin/reportes")).body.reports).toHaveLength(1);
    const outsider = createApp({ store, authenticate: async () => ({ uid: "other", role: "admin", areas: ["obras"], accessLevel: "operator" }) });
    expect((await request(outsider).get("/admin/reportes")).body.reports).toHaveLength(0);
  });

  it("shows unassigned reports to an operator in the responsible area", async () => {
    const store = new InMemoryTriageStore();
    const citizen = createApp({ store, authenticate: async () => ({ uid: "citizen", role: "invitado", areas: [] }) });
    const created = await request(citizen).post("/reportes/ingesta").set("Authorization", "Bearer guest-token").send({ canal: "formulario", texto: "Bache", coordenadas: [24, -104] });
    await store.updateReport(created.body.reportId, { area_responsable: "Obras Públicas" });
    const operator = createApp({ store, authenticate: async () => ({ uid: "operator", role: "admin", areas: ["Obras Públicas"], accessLevel: "operator" }) });
    expect((await request(operator).get("/admin/reportes")).body.reports).toHaveLength(1);
  });

  it("ends clarification after an unknown answer", async () => {
    const app = createApp({ authenticate: async () => ({ uid: "citizen", role: "invitado", areas: [] }) });
    const first = await request(app).post("/reportes/aclarificacion").send({ description: "Hay un bache frente a la escuela", location: { lat: 24, lng: -104 } });
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ sessionId: expect.any(String), complete: false, questions: ["¿Qué tamaño aproximado tiene el bache?"] });
    const done = await request(app).post("/reportes/aclarificacion").send({ sessionId: first.body.sessionId, answers: [{ question: first.body.questions[0], answer: "No lo sé" }] });
    expect(done.body).toMatchObject({ complete: true, questions: [] });
  });

  it("does not ask again for the location or a fixed size question", async () => {
    const app = createApp({ authenticate: async () => ({ uid: "citizen", role: "invitado", areas: [] }) });
    const response = await request(app).post("/reportes/aclarificacion").send({ description: "La lámpara del parque no enciende desde ayer.", location: { lat: 24, lng: -104 } });
    expect(response.body).toMatchObject({ complete: true, questions: [] });
  });

  it("allows an authenticated administrator to use the public clarification step", async () => {
    const app = createApp({ authenticate: async () => ({ uid: "admin", role: "admin", areas: ["servicios"], accessLevel: "operator" }) });
    const response = await request(app).post("/reportes/aclarificacion").send({ description: "Hay un bache frente a la escuela" });
    expect(response.status).toBe(200);
    expect(response.body.questions).toEqual(["¿Qué tamaño aproximado tiene el bache?"]);
  });
});
