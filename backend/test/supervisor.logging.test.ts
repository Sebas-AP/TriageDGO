import { describe, expect, it } from "vitest";

import { Supervisor } from "../src/business/orchestrator/supervisor";
import type { AgentGateway } from "../src/business/orchestrator/supervisor";
import { InMemoryTriageStore } from "../src/data/firestore/triage.store";

const report = {
  reporte_id: "log-01", ciudadano_id: "guest-1", canal: "formulario" as const,
  texto: "bache enorme", coordenadas: [24.0291, -104.6293] as [number, number],
  created_at: "2024-10-21T09:00:00Z", estado: "procesando" as const,
  idempotency_key: "log-key",
};

const agentError = (message: string, delayMs = 0) => async () => {
  if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
  throw new Error(message);
};

const healthyAgents = (): AgentGateway => ({
  classifier: async () => ({ categoria: "bache", urgencia_base: "baja", area_responsable: "Obras", resumen: "Bache", palabras_clave: ["bache"] }),
  pattern: async () => ({ similares_encontrados: 0, posible_causa_estructural: false, ascenso_sugerido: false, nota: "ninguno" }),
  acuse: async () => ({ mensaje: "Recibimos tu reporte." }),
  dedup: async () => ({ duplicado_detectado: false, reporte_id_original: null, confianza: 0, justificacion: "nuevo" }),
  evidence: async () => ({ corresponde_a_descripcion: true, severidad: "baja", senales_detectadas: [], etiqueta_contexto: "" }),
  escalation: async () => ({ debe_escalar: false }),
});

describe("Supervisor agent logs", () => {
  it("crea una traza por agente con eventos ordenados y no bloquea el resultado si un log falla", async () => {
    const store = new InMemoryTriageStore();
    const agents = healthyAgents();
    agents.classifier = async (_report, trace) => {
      await trace?.emit({ type: "agent.message", data: { text: "Clasificando incidente" } });
      return { categoria: "bache", urgencia_base: "baja", area_responsable: "Obras", resumen: "Bache", palabras_clave: ["bache"] };
    };
    const supervisor = new Supervisor(
      store,
      agents,
      { schoolNear: async () => undefined, weatherAggravates: async () => false },
      async () => undefined,
    );

    await supervisor.process({ ...report });

    const trace = [...store.agentTraces.values()].find((entry) => entry.agente === "classifier");
    expect(trace).toMatchObject({ reporte_id: report.reporte_id, agente: "classifier", status: "success", event_count: 1 });
    expect(trace?.finished_at).toEqual(expect.any(String));
    const events = store.agentTraceEvents.get(trace!.trace_id) ?? [];
    expect(events).toEqual([expect.objectContaining({ sequence: 1, type: "agent.message", data: { text: "Clasificando incidente" } })]);
  });

  it.each([
    ["--json-schema is not a valid JSON Schema", "schema_error"],
    ["Invalid MCP configuration: mcpServers missing", "mcp_config_error"],
    ["required MCP servers failed to initialize: reportes: handshaking with MCP server failed", "mcp_initialization_error"],
    ["Agent timed out after 60000ms", "timeout"],
    ["Unexpected token } in JSON at position 42", "json_error"],
    ["Codex process exited with code 1", "process_error"],
  ] as const)("classifies %s as %s", async (message, expectedStatus) => {
    const store = new InMemoryTriageStore();
    const agents = healthyAgents();
    agents.classifier = agentError(message, 15);
    const supervisor = new Supervisor(
      store,
      agents,
      { schoolNear: async () => undefined, weatherAggravates: async () => false },
      async () => undefined,
    );

    await supervisor.process({ ...report });

    const classifierLog = store.logs.find((entry) => entry.agente === "classifier");
    expect(classifierLog).toMatchObject({ status: expectedStatus, error: message });
    expect(classifierLog?.duracion_ms).toBeGreaterThanOrEqual(10);
  });

  it("fragmenta eventos extensos para que cada documento sea seguro para Firestore", async () => {
    const store = new InMemoryTriageStore();
    const traceId = "trace-extenso";
    await store.startAgentTrace({ trace_id: traceId, timestamp: report.created_at, started_at: report.created_at, reporte_id: report.reporte_id, agente: "classifier", status: "running", intento: 1, event_count: 0, events_path: `log_agentes/${traceId}/eventos` });
    await store.appendAgentTrace(traceId, { sequence: 1, part: 0, type: "process.stdout", data: "x".repeat(300 * 1024) });
    const chunks = store.agentTraceEvents.get(traceId) ?? [];
    expect(chunks).toHaveLength(2);
    expect(chunks.map((event) => event.part)).toEqual([0, 1]);
    expect(store.agentTraces.get(traceId)?.event_count).toBe(2);
  });

});
