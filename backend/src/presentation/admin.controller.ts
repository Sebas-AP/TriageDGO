// Controller de la consola admin: bandeja de reportes, estado de subagentes (arq.md §2.1). Sin lógica aún (fase TDD).
import { Router } from "express";

import type { ReportsRepository } from "../data/firestore/reports.repo";

export function createAdminController(reports: ReportsRepository): Router {
  const router = Router();

  router.get("/reportes", async (req, res) => {
    const solicitado = Number(req.query.limite ?? 50);
    const limite = Number.isFinite(solicitado) && solicitado > 0 ? Math.min(solicitado, 200) : 50;
    const lista = await reports.listarRecientes(limite);
    res.status(200).json({ reportes: lista });
  });

  router.get("/reportes/:id", async (req, res) => {
    const reporte = await reports.leerPorId(req.params.id);
    if (!reporte) {
      res.status(404).json({ error: "Reporte no encontrado." });
      return;
    }
    res.status(200).json(reporte);
  });

  return router;
}
