// Webhook Twilio WhatsApp → normaliza a ReporteCrudo (arq.md §2.2).
import express, { Router } from "express";

import type { ReportsRepository } from "../data/firestore/reports.repo";
import type { TranscriptionService } from "../business/services/transcription.service";
import { validateTwilioSignature } from "../mcp/clients/twilio.client";

export interface WhatsappWebhookDeps {
  reports: ReportsRepository;
  transcription: TranscriptionService;
  authToken: string;
  publicBaseUrl: string;
  descargarMedia?: (url: string) => Promise<{ bytes: Buffer; contentType: string }>;
}

const EMPTY_TWIML = `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;

export function createWhatsappWebhook(deps: WhatsappWebhookDeps): Router {
  const router = Router();
  router.use(express.urlencoded({ extended: false }));

  router.post("/", async (req, res) => {
    const signature = req.header("x-twilio-signature") ?? "";
    const url = `${deps.publicBaseUrl}${req.originalUrl}`;
    const valido = validateTwilioSignature({
      authToken: deps.authToken,
      url,
      parameters: req.body as Record<string, string>,
      signature,
    });
    if (!valido) {
      res.status(403).send("Firma inválida.");
      return;
    }

    const from = req.body.From as string | undefined;
    if (!from) {
      res.status(400).send("Falta remitente.");
      return;
    }

    let texto = (req.body.Body as string | undefined) ?? "";
    const numMedia = Number(req.body.NumMedia ?? "0");
    const contentType = (req.body.MediaContentType0 as string | undefined) ?? "";
    if (numMedia > 0 && deps.descargarMedia && contentType.startsWith("audio/")) {
      const { bytes } = await deps.descargarMedia(req.body.MediaUrl0 as string);
      const transcrito = await deps.transcription.transcribir(bytes, "whatsapp-audio", contentType);
      texto = transcrito.texto;
    }

    if (!texto) {
      res.status(400).send("Reporte sin contenido.");
      return;
    }

    await deps.reports.crear({ ciudadanoId: from, canal: "whatsapp", texto, coordenadas: [0, 0] });
    res.status(200).type("text/xml").send(EMPTY_TWIML);
  });

  return router;
}
