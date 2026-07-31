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
const MAX_TWILIO_AUDIO_BYTES = 10 * 1024 * 1024;

function isTrustedTwilioMediaUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "api.twilio.com" || url.hostname.endsWith(".twiliocdn.com"));
  } catch { return false; }
}

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
      if (!isTrustedTwilioMediaUrl(req.body.MediaUrl0)) {
        res.status(400).send("Media URL inválida.");
        return;
      }
      const { bytes, contentType: downloadedContentType } = await deps.descargarMedia(req.body.MediaUrl0);
      if (!downloadedContentType.startsWith("audio/") || bytes.length > MAX_TWILIO_AUDIO_BYTES) {
        res.status(400).send("Audio inválido.");
        return;
      }
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
