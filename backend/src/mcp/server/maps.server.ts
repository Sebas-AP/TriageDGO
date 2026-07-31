import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { MapsTools } from "../tools/maps.tools";

export function createMapsMcpServer(tools: MapsTools) {
  const server = new McpServer({ name: "triage072-maps", version: "0.1.0" });
  server.registerTool("maps.geocodificar", { inputSchema: { direccion: z.string().min(3) } }, async ({ direccion }) => ({ content: [{ type: "text", text: JSON.stringify(await tools.geocodificar(direccion)) }] }));
  server.registerTool("maps.distancia", { inputSchema: { origen: z.tuple([z.number(), z.number()]), destino: z.tuple([z.number(), z.number()]) } }, async ({ origen, destino }) => ({ content: [{ type: "text", text: JSON.stringify({ distancia_km: await tools.distancia(origen, destino) }) }] }));
  server.registerTool("maps.lugares_cercanos", { inputSchema: { lat: z.number(), lon: z.number(), tipo: z.enum(["escuela", "lugar_publico"]), radio_metros: z.number().positive().optional() } }, async ({ lat, lon, tipo, radio_metros }) => ({ content: [{ type: "text", text: JSON.stringify(await tools.lugaresCercanos(lat, lon, tipo, radio_metros)) }] }));
  return server;
}
