import { randomUUID } from "node:crypto";
import type { RequestHandler } from "express";
import { Router } from "express";
import multer from "multer";

import { ReportIngestionService } from "../business/services/report-ingestion.service";
import type { Channel, Principal, ReportInput } from "../business/types";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_request, file, done) => done(null, ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype)),
});

const IMAGE_SIGNATURES: Record<string, Buffer> = {
  "image/jpeg": Buffer.from([0xff, 0xd8, 0xff]),
  "image/png": Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  "image/webp": Buffer.from("RIFF"),
};

/** Validates image file by checking magic bytes signature. */
function isValidatedImage(file: Express.Multer.File): boolean {
  const signature = IMAGE_SIGNATURES[file.mimetype];
  if (!signature || !file.buffer.subarray(0, signature.length).equals(signature)) return false;
  // A RIFF container is not necessarily WebP; its format marker must be WEBP.
  return file.mimetype !== "image/webp" || file.buffer.subarray(8, 12).equals(Buffer.from("WEBP"));
}

export interface IngestionControllerDependencies {
  ingestion: ReportIngestionService;
  authenticate: (request: Parameters<RequestHandler>[0]) => Promise<Principal>;
}

/**
 * Creates the ingestion router for POST /reportes/ingesta.
 *
 * Handles:
 * - Multipart form data with optional photo attachment
 * - Image validation (magic bytes check)
 * - Idempotency via Idempotency-Key header
 * - Public submissions (invitado) and authenticated submissions (admin)
 *
 * @param deps - Ingestion service and authentication function
 * @returns Express Router
 */
export function createIngestionController({ ingestion, authenticate }: IngestionControllerDependencies): Router {
  const router = Router();
  router.post("/", upload.single("photo"), async (request, response) => {
    try {
      const principal = await authenticate(request);
      if (!principal || !["invitado", "admin"].includes(principal.role)) return response.status(403).json({ error: "FORBIDDEN" });
      if (request.file && !isValidatedImage(request.file)) return response.status(400).json({ error: "INVALID_ATTACHMENT" });
      const input = normalizeReport(request.body ?? {});
      if (!input) return response.status(400).json({ error: "INVALID_REPORT" });
      const idempotencyKey = request.get("Idempotency-Key") ?? `form-${randomUUID()}`;
      const { report, job } = await ingestion.enqueue(input, principal, idempotencyKey);
      return response.status(202).json({
        reportId: report.reporte_id,
        folio: report.reporte_id,
        status: "received",
        // Compatibility fields for existing channel adapters. New consumers use camelCase above.
        reporte_id: report.reporte_id,
        job_id: job.job_id,
        estado: "encolado",
        status_url: `/reportes/${report.reporte_id}`,
      });
    } catch (error) {
      if (error instanceof multer.MulterError) return response.status(400).json({ error: "INVALID_ATTACHMENT" });
      return response.status(error instanceof Error && error.message === "UNAUTHENTICATED" ? 401 : 500).json({ error: "INGESTION_FAILED" });
    }
  });
  return router;
}

function normalizeReport(body: Record<string, unknown>): ReportInput | undefined {
  if (typeof body.canal === "string") return normalizeInternalReport(body);
  if (typeof body.description !== "string" || !body.description.trim() || typeof body.location !== "string") return undefined;
  try {
    const location = JSON.parse(body.location) as { lat?: unknown; lng?: unknown };
    if (typeof location.lat !== "number" || typeof location.lng !== "number" || !Number.isFinite(location.lat) || !Number.isFinite(location.lng) || location.lat < -90 || location.lat > 90 || location.lng < -180 || location.lng > 180) return undefined;
    return { canal: "formulario", texto: body.description.trim(), coordenadas: [location.lat, location.lng] };
  } catch { return undefined; }
}

function normalizeInternalReport(body: Record<string, unknown>): ReportInput | undefined {
  const channel = { formulario: "formulario", form: "formulario", whatsapp: "whatsapp", llamada: "voz", call: "voz", voz: "voz" }[body.canal as string] as Channel | undefined;
  if (!channel || typeof body.texto !== "string" || !body.texto.trim() || !Array.isArray(body.coordenadas) || body.coordenadas.length !== 2 || !body.coordenadas.every((item) => typeof item === "number" && Number.isFinite(item)) || body.coordenadas[0] < -90 || body.coordenadas[0] > 90 || body.coordenadas[1] < -180 || body.coordenadas[1] > 180) return undefined;
  return { canal: channel, texto: body.texto.trim(), coordenadas: [body.coordenadas[0] as number, body.coordenadas[1] as number], vulnerable: body.vulnerable === true };
}
