import type { AcuseSender } from "../orchestrator/supervisor";
import { createTwilioHttpClient } from "../../mcp/clients/twilio.client";

function whatsappDestination(phone: string): string | undefined {
  const normalized = phone.replace(/\D/g, "");
  if (normalized.length === 10) return `whatsapp:+52${normalized}`;
  if (normalized.length >= 11) return `whatsapp:+${normalized}`;
  return undefined;
}

export const notificationService: AcuseSender = async (report, message, ticketId) => {
  const destination = report.contact?.consent && report.contact.phone ? whatsappDestination(report.contact.phone) : undefined;
  if (!destination) { console.warn(`Acuse pendiente ${ticketId}: sin contacto autorizado`); return false; }
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const whatsappFrom = process.env.TWILIO_WHATSAPP_FROM;
  if (!accountSid || !authToken || !whatsappFrom) { console.warn(`Acuse pendiente ${ticketId}: Twilio no configurado`); return false; }
  try {
    await createTwilioHttpClient(accountSid, authToken, whatsappFrom).enviarWhatsapp(destination, message);
    return true;
  } catch {
    console.warn(`Acuse pendiente ${ticketId}: entrega WhatsApp fallida`);
    return false;
  }
};
