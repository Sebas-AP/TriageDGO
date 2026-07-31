import { describe, expect, it } from "vitest";
import request from "supertest";

import { createApp } from "../src/app";
import { InMemoryTriageStore } from "../src/data/firestore/triage.store";

describe("POST /reportes/ingesta", () => {
  it("encola un reporte de un invitado y devuelve el identificador consultable", async () => {
    const store = new InMemoryTriageStore();
    const app = createApp({
      store,
      authenticate: async () => ({ uid: "guest-1", role: "invitado", areas: [] }),
    });

    const response = await request(app)
      .post("/reportes/ingesta")
      .set("Idempotency-Key", "form-123")
      .send({
        canal: "formulario",
        texto: "Hay un bache profundo frente a mi casa",
        coordenadas: [24.0291, -104.6293],
        vulnerable: false,
      });

    expect(response.status).toBe(202);
    expect(response.body).toMatchObject({ estado: "encolado" });
    expect(response.body.reporte_id).toEqual(expect.any(String));
    expect(response.body.job_id).toEqual(expect.any(String));
    expect(response.body.status_url).toBe(`/reportes/${response.body.reporte_id}`);

    const repeated = await request(app)
      .post("/reportes/ingesta")
      .set("Idempotency-Key", "form-123")
      .send({ canal: "formulario", texto: "Hay un bache profundo frente a mi casa", coordenadas: [24.0291, -104.6293] });

    expect(repeated.status).toBe(202);
    expect(repeated.body.reporte_id).toBe(response.body.reporte_id);
  });
});
