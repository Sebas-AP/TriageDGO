import type { AcuseSender } from "../orchestrator/supervisor";

export const notificationService: AcuseSender = async (report, message, ticketId) => {
  void report;
  const token = process.env.TELEGRAM_CITIZEN_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CITIZEN_CHAT_ID?.trim();
  if (!token || !chatId) { console.warn(`Acuse pendiente ${ticketId}: Telegram ciudadano no configurado`); return false; }
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ chat_id: chatId, text: `✅ Reporte ${ticketId}\n\n${message}`, protect_content: true, link_preview_options: { is_disabled: true } }), signal: AbortSignal.timeout(10_000) });
    const body = await response.json() as { ok?: boolean };
    return response.ok && body.ok === true;
  } catch {
    console.warn(`Acuse pendiente ${ticketId}: entrega Telegram fallida`);
    return false;
  }
};
