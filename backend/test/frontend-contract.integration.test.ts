import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app";
import { InMemoryTriageStore } from "../src/data/firestore/triage.store";

const guest = async () => ({ uid: "citizen-1", role: "invitado" as const, areas: [] });

describe("frontend report contract", () => {
  it("accepts a multipart form, normalizes it, and returns the frontend submission shape", async () => {
    const store = new InMemoryTriageStore();
    const app = createApp({ store, authenticate: guest });

    const response = await request(app)
      .post("/reportes/ingesta")
      .field("citizenName", "María Pérez")
      .field("phone", "6181234567")
      .field("consent", "true")
      .field("description", "Hay un bache profundo frente a la escuela primaria.")
      .field("answers", JSON.stringify([{ question: "¿Qué tamaño tiene?", answer: "No lo sé" }]))
      .field("location", JSON.stringify({ address: "Hidalgo 100", lat: 24.0291, lng: -104.6293, placeId: "place-1" }))
      .attach("photo", Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), { filename: "bache.png", contentType: "image/png" });

    expect(response.status).toBe(202);
    expect(response.body).toMatchObject({ reportId: expect.any(String), folio: expect.any(String), status: "received" });
    expect(response.body.folio).toBe(response.body.reportId);
    const report = await store.getReport(response.body.reportId);
    expect(report?.answers).toEqual([{ question: "¿Qué tamaño tiene?", answer: "No lo sé" }]);
  });

  it("deduplicates a multipart submission when the browser retries with the same key", async () => {
    const app = createApp({ store: new InMemoryTriageStore(), authenticate: guest });
    const payload = () => request(app).post("/reportes/ingesta").set("Idempotency-Key", "browser-retry")
      .field("citizenName", "María Pérez").field("phone", "6181234567").field("consent", "true")
      .field("description", "Hay un bache profundo frente a la escuela primaria.")
      .field("location", JSON.stringify({ address: "Hidalgo 100", lat: 24.0291, lng: -104.6293 }));

    const first = await payload();
    const retried = await payload();

    expect(first.status).toBe(202);
    expect(retried.body.reportId).toBe(first.body.reportId);
  });

  it("accepts the public wizard without an Authorization header", async () => {
    const app = createApp({
      store: new InMemoryTriageStore(),
      authenticate: async () => {
        throw new Error("authentication must not run for a public submission");
      },
    });

    const response = await request(app)
      .post("/reportes/ingesta")
      .set("Idempotency-Key", "public-wizard")
      .field("citizenName", "María Pérez")
      .field("phone", "6181234567")
      .field("consent", "true")
      .field("description", "Hay un bache profundo frente a la escuela primaria.")
      .field("location", JSON.stringify({ address: "Hidalgo 100", lat: 24.0291, lng: -104.6293 }));

    expect(response.status).toBe(202);
    expect(response.body).toMatchObject({ status: "received" });
  });

  it("returns only the safe public report projection without authentication", async () => {
    const store = new InMemoryTriageStore();
    const app = createApp({ store, authenticate: guest });
    const created = await request(app).post("/reportes/ingesta").set("Idempotency-Key", "public-report")
      .send({ canal: "formulario", texto: "Bache peligroso frente a la escuela.", coordenadas: [24.0291, -104.6293] });

    const response = await request(app).get(`/reportes/${created.body.reportId}`);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ id: created.body.reportId, folio: created.body.reportId, status: "received" });
    expect(response.body).not.toHaveProperty("ciudadano_id");
    expect(response.body).not.toHaveProperty("idempotency_key");
    expect(response.body.location).not.toHaveProperty("lat");
    expect(response.body.location).not.toHaveProperty("lng");
  });

  it("allows the configured frontend origin and rejects a non-admin admin request", async () => {
    const app = createApp({ store: new InMemoryTriageStore(), authenticate: guest });

    const preflight = await request(app).options("/reportes/ingesta").set("Origin", "http://localhost:5173").set("Access-Control-Request-Method", "POST");
    const admin = await request(app).get("/admin/reportes");

    expect(preflight.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    expect(admin.status).toBe(403);
    expect(admin.headers["x-powered-by"]).toBeUndefined();
    expect(admin.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("rejects a file that only claims to be an image", async () => {
    const app = createApp({ store: new InMemoryTriageStore(), authenticate: guest });
    const response = await request(app).post("/reportes/ingesta")
      .field("description", "Bache")
      .field("location", JSON.stringify({ lat: 24.0291, lng: -104.6293 }))
      .attach("photo", Buffer.from("not an image"), { filename: "fake.png", contentType: "image/png" });
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "INVALID_ATTACHMENT" });
  });
});
