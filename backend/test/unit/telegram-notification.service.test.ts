import { afterEach, describe, expect, it, vi } from "vitest";

import { formatTelegramAlert, routeTicket, TelegramTicketNotifier } from "../../src/business/services/telegram-notification.service";
import type { Report, Ticket } from "../../src/business/types";

const report: Report = {
  reporte_id: "rep-1", ciudadano_id: "cit-1", canal: "formulario", texto: "Hay un bache profundo frente a la escuela.",
  coordenadas: [24.0277, -104.6532], created_at: "2026-07-31T06:00:00.000Z", estado: "completado", idempotency_key: "idem-1",
};

const ticket: Ticket = {
  ticket_id: "DUR-TEST", reporte_id: "rep-1", categoria: "bache", area_responsable: "Obras Públicas",
  urgencia_final: "alta", prioridad_final: "P1", regla_gatillada: null, revision_manual: false,
  acuse_enviado: true, duplicados: 0, atencion_preferente: false, modificadores: [], created_at: "2026-07-31T06:00:01.000Z",
};

afterEach(() => vi.unstubAllEnvs());

describe("TelegramTicketNotifier", () => {
  it("enruta baches y categorías sanitarias a bots separados", () => {
    expect(routeTicket(ticket)).toEqual(["baches"]);
    expect(routeTicket({ ...ticket, categoria: "basura_acumulada" })).toEqual(["salud"]);
    expect(routeTicket({ ...ticket, categoria: "revision_manual", revision_manual: true })).toEqual([]);
  });

  it("construye una alerta operativa sin incluir secretos", () => {
    const text = formatTelegramAlert(report, ticket, "baches", "https://admin.example");
    expect(text).toContain("DUR-TEST");
    expect(text).toContain("P1");
    expect(text).toContain("https://www.google.com/maps?q=24.0277,-104.6532");
    expect(text).toContain("https://admin.example/admin?reporte=rep-1");
    expect(text).not.toContain("BOT_TOKEN");
  });

  it("envía al bot configurado y protege el contenido", async () => {
    vi.stubEnv("TELEGRAM_BACHES_BOT_TOKEN", "secret-token");
    vi.stubEnv("TELEGRAM_BACHES_CHAT_ID", "-100123");
    const request = vi.fn(async () => new Response(JSON.stringify({ ok: true, result: { message_id: 42 } }), { status: 200 }));
    const notifier = new TelegramTicketNotifier({ fetch: request as typeof fetch, maxAttempts: 1 });

    await expect(notifier.notify(report, ticket)).resolves.toEqual([{ destination: "baches", status: "sent", messageId: 42 }]);
    const [url, options] = request.mock.calls[0];
    expect(url).toBe("https://api.telegram.org/botsecret-token/sendMessage");
    const body = JSON.parse(String(options?.body));
    expect(body).toMatchObject({ chat_id: "-100123", protect_content: true, link_preview_options: { is_disabled: true } });
  });

  it("respeta retry_after sin lanzar el error al pipeline", async () => {
    vi.stubEnv("TELEGRAM_BACHES_BOT_TOKEN", "secret-token");
    vi.stubEnv("TELEGRAM_BACHES_CHAT_ID", "-100123");
    const request = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: false, parameters: { retry_after: 1 } }), { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, result: { message_id: 7 } }), { status: 200 }));
    const sleep = vi.fn(async () => undefined);
    const notifier = new TelegramTicketNotifier({ fetch: request as typeof fetch, sleep, maxAttempts: 2 });

    await expect(notifier.notify(report, ticket)).resolves.toEqual([{ destination: "baches", status: "sent", messageId: 7 }]);
    expect(sleep).toHaveBeenCalledWith(1000);
  });

  it("omite destinos sin credenciales", async () => {
    vi.stubEnv("TELEGRAM_BACHES_BOT_TOKEN", "");
    vi.stubEnv("TELEGRAM_BACHES_CHAT_ID", "");
    const notifier = new TelegramTicketNotifier({ fetch: vi.fn() as typeof fetch });
    await expect(notifier.notify(report, ticket)).resolves.toEqual([{ destination: "baches", status: "skipped", reason: "not_configured" }]);
  });
});
