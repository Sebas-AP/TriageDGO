import { describe, expect, it } from "vitest";

import { Supervisor } from "../src/business/orchestrator/supervisor";
import { InMemoryTriageStore } from "../src/data/firestore/triage.store";
import type { AgentGateway, GeoGateway } from "../src/business/orchestrator/supervisor";

const report = { reporte_id: "F-01", ciudadano_id: "guest-1", canal: "formulario" as const, texto: "bache enorme", coordenadas: [24.0291, -104.6293] as [number, number], vulnerable: false, adjuntos: [], timestamp: "2024-10-21T09:00:00Z", created_at: "2024-10-21T09:00:00Z", estado: "procesando" as const, idempotency_key: "x" };

const agents: AgentGateway = {
  classifier: async () => ({ categoria: "bache", urgencia_base: "baja", area_responsable: "Obras Públicas", resumen: "Bache", palabras_clave: ["bache"] }),
  pattern: async () => ({ similares_encontrados: 6, posible_causa_estructural: true, ascenso_sugerido: true, nota: "hotspot" }),
  acuse: async () => ({ mensaje: "Recibimos tu reporte." }),
  dedup: async () => ({ duplicado_detectado: false, reporte_id_original: null, confianza: 0.1, justificacion: "nuevo" }),
  evidence: async () => ({ corresponde_a_descripcion: true, severidad: "media", senales_detectadas: [], etiqueta_contexto: "" }),
  escalation: async () => ({ debe_escalar: true, director_area: "Obras Públicas", mensaje_escalamiento: "Atender", motivo: "riesgo" }),
};

describe("Supervisor", () => {
  it("aplica Regla 1 con seis similares y crea el ticket antes del acuse", async () => {
    const store = new InMemoryTriageStore();
    const calls: string[] = [];
    const supervisor = new Supervisor(store, agents, { schoolNear: async () => undefined, weatherAggravates: async () => false }, async () => { calls.push("acuse"); });
    const outcome = await supervisor.process(report);
    expect(outcome.ticket.urgencia_final).toBe("alta");
    expect(outcome.ticket.prioridad_final).toBe("P1");
    expect(outcome.ticket.regla_gatillada).toBe("regla_1_patron_estructural");
    expect(outcome.ticket.ticket_id).toBeTruthy();
    expect(calls).toEqual(["acuse"]);
  });

  it("deja un P1 provisional y revisión manual si falla clasificación", async () => {
    const store = new InMemoryTriageStore();
    const broken = { ...agents, classifier: async () => { throw new Error("timeout"); } };
    const supervisor = new Supervisor(store, broken, { schoolNear: async () => undefined, weatherAggravates: async () => false }, async () => undefined);
    const outcome = await supervisor.process(report);
    expect(outcome.ticket).toMatchObject({ categoria: "revision_manual", area_responsable: "revision_manual", prioridad_final: "P1", revision_manual: true });
  });

  it("aplica Regla 2 para categoría de riesgo cerca de escuela", async () => {
    const store = new InMemoryTriageStore();
    const risk = { ...agents, classifier: async () => ({ categoria: "semaforo_apagado" as const, urgencia_base: "alta" as const, area_responsable: "Vialidad", resumen: "Cruce", palabras_clave: ["semaforo"] }) };
    const geo: GeoGateway = { schoolNear: async () => "Primaria", weatherAggravates: async () => false };
    const supervisor = new Supervisor(store, risk, geo, async () => undefined);
    const outcome = await supervisor.process(report);
    expect(outcome.ticket).toMatchObject({ urgencia_final: "critica", prioridad_final: "P0", regla_gatillada: "regla_2_cercania_escuela", escalado: true });
  });
});
