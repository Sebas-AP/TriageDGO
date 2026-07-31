import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { BuscarSimilaresTool } from "../tools/buscar-similares.tool";
import type { CrearTicketTool } from "../tools/crear-ticket.tool";
import type { EnviarAcuseTool } from "../tools/enviar-acuse.tool";

export function createReportesMcpServer(deps: { buscarSimilares: BuscarSimilaresTool; crearTicket: CrearTicketTool; enviarAcuse: EnviarAcuseTool }) {
  const server = new McpServer({ name: "triage072-reportes", version: "0.1.0" });
  server.registerTool("reportes.buscar_similares", { description: "Busca reincidencias sin exponer datos personales.", inputSchema: { texto: z.string().min(1), lat: z.number().gte(-90).lte(90), lon: z.number().gte(-180).lte(180), radio_km: z.number().positive().optional(), dias: z.number().int().positive().optional() } }, async (input) => ({ content: [{ type: "text", text: JSON.stringify(await deps.buscarSimilares.ejecutar(input)) }] }));
  server.registerTool("tickets.crear", { description: "Crea un ticket consolidado; solo Supervisor autenticado.", inputSchema: { reporteId: z.string().min(1), categoria: z.string().min(1), urgenciaFinal: z.enum(["baja", "media", "alta", "critica"]), prioridadFinal: z.enum(["P0", "P1", "P2", "P3"]), area: z.string().min(1) } }, async (input) => ({ content: [{ type: "text", text: JSON.stringify(await deps.crearTicket.ejecutar(input)) }] }));
  server.registerTool("reportes.enviar_acuse", { description: "Envía un acuse después de crear el ticket.", inputSchema: { ciudadanoId: z.string().min(1), destino: z.string().min(3), mensaje: z.string().min(1).max(1600) } }, async (input) => ({ content: [{ type: "text", text: JSON.stringify(await deps.enviarAcuse.ejecutar(input.ciudadanoId, input.destino, input.mensaje)) }] }));
  return server;
}
