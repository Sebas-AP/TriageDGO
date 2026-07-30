import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { TwilioClient } from "../clients/twilio.client";

export function createTwilioMcpServer(client: TwilioClient) {
  const server = new McpServer({ name: "triage072-twilio", version: "0.1.0" });
  server.registerTool("twilio.enviar_whatsapp", { inputSchema: { destino: z.string().min(3), mensaje: z.string().min(1).max(1600) } }, async ({ destino, mensaje }) => ({ content: [{ type: "text", text: JSON.stringify(await client.enviarWhatsapp(destino, mensaje)) }] }));
  server.registerTool("twilio.iniciar_llamada", { inputSchema: { destino: z.string().min(3), twimlUrl: z.string().url() } }, async ({ destino, twimlUrl }) => ({ content: [{ type: "text", text: JSON.stringify(await client.iniciarLlamada(destino, twimlUrl)) }] }));
  return server;
}
