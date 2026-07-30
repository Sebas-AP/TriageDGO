import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { createReportController } from "../../src/presentation/report.controller";
import { createFakeReportsRepository } from "../helpers/fake-reports-repo";

function buildApp() {
  const reports = createFakeReportsRepository();
  const app = express();
  app.use(express.json());
  app.use("/reportes/ingesta", createReportController(reports));
  return { app, reports };
}

describe("POST /reportes/ingesta", () => {
  it("crea un reporte y devuelve 201 con folio", async () => {
    const { app } = buildApp();
    const response = await request(app)
      .post("/reportes/ingesta")
      .send({
        ciudadanoId: "ciudadano-1",
        canal: "formulario",
        texto: "Bache en Hidalgo esquina Zaragoza",
        coordenadas: [24.02, -104.67],
      });

    expect(response.status).toBe(201);
    expect(response.body.estado).toBe("abierto");
    expect(typeof response.body.reporte_id).toBe("string");
  });

  it("rechaza un body inválido con 400", async () => {
    const { app } = buildApp();
    const response = await request(app).post("/reportes/ingesta").send({ texto: "sin lo demás" });

    expect(response.status).toBe(400);
    expect(response.body.error).toBeDefined();
  });
});
