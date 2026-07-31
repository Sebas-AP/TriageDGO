import { createHmac } from "node:crypto";

import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { TranscriptionService, type WhisperClient } from "../../src/business/services/transcription.service";
import { createWhatsappWebhook } from "../../src/presentation/whatsapp.webhook";
import { createFakeReportsRepository } from "../helpers/fake-reports-repo";

const AUTH_TOKEN = "test-auth-token";
const BASE_URL = "http://localhost:3000";

function firmar(url: string, params: Record<string, string>): string {
  const body = Object.keys(params)
    .sort()
    .reduce((current, key) => current + key + params[key], url);
  return createHmac("sha1", AUTH_TOKEN).update(body).digest("base64");
}

function buildApp(whisper: WhisperClient = { transcribir: async () => ({ texto: "" }) }) {
  const reports = createFakeReportsRepository();
  const transcription = new TranscriptionService(whisper);
  const app = express();
  app.use(
    "/webhooks/whatsapp",
    createWhatsappWebhook({
      reports,
      transcription,
      authToken: AUTH_TOKEN,
      publicBaseUrl: BASE_URL,
    }),
  );
  return { app, reports };
}

describe("POST /webhooks/whatsapp", () => {
  it("rechaza firmas inválidas con 403", async () => {
    const { app } = buildApp();
    const response = await request(app)
      .post("/webhooks/whatsapp")
      .set("x-twilio-signature", "firma-invalida")
      .type("form")
      .send({ From: "whatsapp:+5216180000000", Body: "hola" });

    expect(response.status).toBe(403);
  });

  it("crea un reporte a partir de un mensaje de texto válido", async () => {
    const { app, reports } = buildApp();
    const params = { From: "whatsapp:+5216180000000", Body: "Hay un bache enorme", NumMedia: "0" };
    const signature = firmar(`${BASE_URL}/webhooks/whatsapp`, params);

    const response = await request(app)
      .post("/webhooks/whatsapp")
      .set("x-twilio-signature", signature)
      .type("form")
      .send(params);

    expect(response.status).toBe(200);
    const creados = await reports.listarPorCiudadano("whatsapp:+5216180000000");
    expect(creados).toHaveLength(1);
    expect(creados[0].texto).toBe("Hay un bache enorme");
  });
});
