import { createHmac, timingSafeEqual } from "node:crypto";

export interface TwilioClient {
  enviarWhatsapp(destino: string, mensaje: string): Promise<{ sid: string; estado: "enviado" | "simulado" }>;
  iniciarLlamada(destino: string, twimlUrl: string): Promise<{ sid: string; estado: "iniciada" | "simulada" }>;
}

export interface TwilioSignatureInput {
  authToken: string;
  url: string;
  parameters: Record<string, string>;
  signature: string;
}

export function validateTwilioSignature({ authToken, url, parameters, signature }: TwilioSignatureInput): boolean {
  const body = Object.keys(parameters).sort().reduce((current, key) => current + key + parameters[key], url);
  const expected = createHmac("sha1", authToken).update(body).digest("base64");
  const actualBytes = Buffer.from(signature);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

export function createUnavailableTwilioClient(): TwilioClient {
  return {
    async enviarWhatsapp() { return { sid: "simulado-sin-credenciales", estado: "simulado" }; },
    async iniciarLlamada() { return { sid: "simulado-sin-credenciales", estado: "simulada" }; },
  };
}

export function createTwilioHttpClient(accountSid: string, authToken: string, whatsappFrom: string, fetchFn: typeof fetch = fetch): TwilioClient {
  const call = async (resource: string, values: Record<string, string>) => {
    const basic = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
    const response = await fetchFn(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/${resource}.json`, { method: "POST", headers: { authorization: `Basic ${basic}`, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(values), signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error("Twilio no disponible.");
    return response.json() as Promise<{ sid: string }>;
  };
  return {
    async enviarWhatsapp(destino, mensaje) { const data = await call("Messages", { To: destino, From: whatsappFrom, Body: mensaje }); return { sid: data.sid, estado: "enviado" }; },
    async iniciarLlamada(destino, twimlUrl) { const data = await call("Calls", { To: destino, From: whatsappFrom.replace("whatsapp:", ""), Url: twimlUrl }); return { sid: data.sid, estado: "iniciada" }; },
  };
}
