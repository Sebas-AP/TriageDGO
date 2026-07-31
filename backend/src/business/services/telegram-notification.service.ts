import type { Category, Report, Ticket } from "../types";

export type TelegramDestination = "salud" | "baches";

export interface TelegramDelivery {
  destination: TelegramDestination;
  status: "sent" | "skipped" | "failed";
  messageId?: number;
  reason?: string;
}

export interface TicketNotifier {
  notify(report: Report, ticket: Ticket): Promise<TelegramDelivery[]>;
}

interface TelegramTarget {
  destination: TelegramDestination;
  token: string;
  chatId: string;
}

interface TelegramApiResponse {
  ok: boolean;
  result?: { message_id?: number };
  description?: string;
  parameters?: { retry_after?: number };
}

interface TelegramNotifierOptions {
  fetch?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  timeoutMs?: number;
  maxAttempts?: number;
  adminBaseUrl?: string;
}

const DEFAULT_HEALTH_CATEGORIES: Category[] = ["basura_acumulada", "drenaje_tapado", "fuga_agua"];

function configuredHealthCategories(value = process.env.TELEGRAM_SALUD_CATEGORIES): Set<Category> {
  const valid = new Set<Category>([
    "bache", "fuga_agua", "alumbrado_apagado", "semaforo_apagado", "basura_acumulada",
    "cable_caido", "ruido_excesivo", "arbol_riesgoso", "riesgo_seguridad", "drenaje_tapado",
  ]);
  if (!value?.trim()) return new Set(DEFAULT_HEALTH_CATEGORIES);
  return new Set(value.split(",").map((item) => item.trim()).filter((item): item is Category => valid.has(item as Category)));
}

export function routeTicket(ticket: Ticket, healthCategories = configuredHealthCategories()): TelegramDestination[] {
  if (ticket.revision_manual || ticket.categoria === "revision_manual") return [];
  const destinations = new Set<TelegramDestination>();
  if (ticket.categoria === "bache") destinations.add("baches");
  if (healthCategories.has(ticket.categoria)) destinations.add("salud");
  return [...destinations];
}

function targetFromEnv(destination: TelegramDestination): TelegramTarget | undefined {
  const prefix = destination === "salud" ? "TELEGRAM_SALUD" : "TELEGRAM_BACHES";
  const token = process.env[`${prefix}_BOT_TOKEN`]?.trim();
  const chatId = process.env[`${prefix}_CHAT_ID`]?.trim();
  if (!token || !chatId) return undefined;
  return { destination, token, chatId };
}

function compact(value: string, limit: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= limit ? normalized : `${normalized.slice(0, limit - 1)}…`;
}

export function formatTelegramAlert(report: Report, ticket: Ticket, destination: TelegramDestination, adminBaseUrl?: string): string {
  const department = destination === "salud" ? "SALUD / RIESGO SANITARIO" : "BACHES / OBRAS PÚBLICAS";
  const mapsUrl = `https://www.google.com/maps?q=${report.coordenadas[0]},${report.coordenadas[1]}`;
  const adminUrl = adminBaseUrl ? `${adminBaseUrl.replace(/\/$/, "")}/admin?reporte=${encodeURIComponent(report.reporte_id)}` : undefined;
  return [
    `🚨 NUEVO REPORTE · ${department}`,
    "",
    `Folio: ${ticket.ticket_id}`,
    `Prioridad: ${ticket.prioridad_final} · Urgencia: ${ticket.urgencia_final.toUpperCase()}`,
    `Categoría: ${ticket.categoria}`,
    `Área: ${ticket.area_responsable}`,
    `Canal: ${report.canal}`,
    "",
    compact(report.texto, 900),
    "",
    `📍 ${mapsUrl}`,
    ...(adminUrl ? [`🔎 ${adminUrl}`] : []),
    `Reporte: ${report.reporte_id}`,
  ].join("\n").slice(0, 4096);
}

export class TelegramTicketNotifier implements TicketNotifier {
  private readonly request: typeof fetch;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly timeoutMs: number;
  private readonly maxAttempts: number;
  private readonly adminBaseUrl?: string;

  constructor(options: TelegramNotifierOptions = {}) {
    this.request = options.fetch ?? fetch;
    this.sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
    this.timeoutMs = options.timeoutMs ?? Number(process.env.TELEGRAM_TIMEOUT_MS ?? 5000);
    this.maxAttempts = options.maxAttempts ?? Number(process.env.TELEGRAM_MAX_ATTEMPTS ?? 3);
    this.adminBaseUrl = options.adminBaseUrl ?? process.env.ADMIN_APP_URL;
  }

  async notify(report: Report, ticket: Ticket): Promise<TelegramDelivery[]> {
    const destinations = routeTicket(ticket);
    return Promise.all(destinations.map(async (destination): Promise<TelegramDelivery> => {
      const target = targetFromEnv(destination);
      if (!target) return { destination, status: "skipped", reason: "not_configured" };
      try {
        const messageId = await this.send(target, formatTelegramAlert(report, ticket, destination, this.adminBaseUrl));
        return { destination, status: "sent", ...(messageId ? { messageId } : {}) };
      } catch (error) {
        return { destination, status: "failed", reason: error instanceof Error ? error.message : "telegram_delivery_failed" };
      }
    }));
  }

  private async send(target: TelegramTarget, text: string): Promise<number | undefined> {
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      let response: Response;
      let body: TelegramApiResponse;
      try {
        response = await this.request(`https://api.telegram.org/bot${target.token}/sendMessage`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            chat_id: target.chatId,
            text,
            protect_content: true,
            link_preview_options: { is_disabled: true },
          }),
          signal: controller.signal,
        });
        body = await response.json() as TelegramApiResponse;
      } catch (error) {
        if (attempt === this.maxAttempts) throw new Error(error instanceof Error && error.name === "AbortError" ? "telegram_timeout" : "telegram_network_error");
        await this.sleep(250 * 2 ** (attempt - 1));
        continue;
      } finally {
        clearTimeout(timer);
      }
      if (response.ok && body.ok) return body.result?.message_id;
      const retryAfter = body.parameters?.retry_after;
      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt === this.maxAttempts) throw new Error(`telegram_http_${response.status}`);
      await this.sleep(retryAfter ? retryAfter * 1000 : 250 * 2 ** (attempt - 1));
    }
    throw new Error("telegram_delivery_failed");
  }
}

export const telegramTicketNotifier = new TelegramTicketNotifier();
