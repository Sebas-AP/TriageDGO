import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { createAdminController } from "../../src/presentation/admin.controller";
import { createFakeReportsRepository } from "../helpers/fake-reports-repo";

function buildApp() {
  const reports = createFakeReportsRepository();
  const app = express();
  app.use(express.json());
  app.use("/admin", createAdminController(reports));
  return { app, reports };
}

describe("GET /admin/reportes", () => {
  it("lista los reportes recientes", async () => {
    const { app, reports } = buildApp();
    await reports.crear({
      ciudadanoId: "c1",
      canal: "formulario",
      texto: "Fuga de agua",
      coordenadas: [24.0, -104.0],
    });

    const response = await request(app).get("/admin/reportes");

    expect(response.status).toBe(200);
    expect(response.body.reportes).toHaveLength(1);
    expect(response.body.reportes[0].texto).toBe("Fuga de agua");
  });

  it("devuelve 404 si el reporte no existe", async () => {
    const { app } = buildApp();
    const response = await request(app).get("/admin/reportes/no-existe");
    expect(response.status).toBe(404);
  });

  it("devuelve un reporte por id", async () => {
    const { app, reports } = buildApp();
    const creado = await reports.crear({
      ciudadanoId: "c1",
      canal: "formulario",
      texto: "Cable caído",
      coordenadas: [24.0, -104.0],
    });

    const response = await request(app).get(`/admin/reportes/${creado.id}`);

    expect(response.status).toBe(200);
    expect(response.body.id).toBe(creado.id);
  });
});
