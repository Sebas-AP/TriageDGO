import { Router } from "express";

import type { ReportsRepository } from "../data/firestore/reports.repo";
import { NuevoReporteSchema } from "./schemas";

export function createReportController(reports: ReportsRepository): Router {
  const router = Router();

  router.post("/", async (req, res) => {
    const parsed = NuevoReporteSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Reporte inválido.", detalles: parsed.error.flatten() });
      return;
    }
    const reporte = await reports.crear(parsed.data);
    res.status(201).json({ reporte_id: reporte.id, folio: reporte.id, estado: reporte.estado });
  });

  return router;
}
