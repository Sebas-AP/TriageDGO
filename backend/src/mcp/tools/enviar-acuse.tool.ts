import type { TwilioClient } from "../clients/twilio.client";

export class EnviarAcuseTool { constructor(private readonly twilio: TwilioClient) {} ejecutar(ciudadanoId: string, destino: string, mensaje: string) { void ciudadanoId; return this.twilio.enviarWhatsapp(destino, mensaje); } }
