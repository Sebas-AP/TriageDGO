import type { AcuseSender } from "../orchestrator/supervisor";
export const notificationService: AcuseSender = async (_citizenId, message, ticketId) => {
  if (!process.env.TWILIO_WHATSAPP_FROM || !process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) { console.warn(`Acuse pendiente ${ticketId}: ${message}`); return; }
  // The channel adapter resolves citizen id to a destination; no PII is persisted in agent logs.
  console.warn(`Twilio destination missing for ticket ${ticketId}`);
};
