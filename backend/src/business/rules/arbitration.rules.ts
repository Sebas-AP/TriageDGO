import type { Category, Urgency } from "../types";
import { atLeast, priorityFor, raiseOnce } from "./priority.rules";

const RISK_NEAR_SCHOOL: Category[] = ["fuga_agua", "semaforo_apagado", "cable_caido", "riesgo_seguridad"];
export interface ArbitrationInput { categoria: Category; urgencia: Urgency; similares: number; causaEstructural: boolean; cercaEscuela: boolean; modifier: boolean; }
export function arbitrate(input: ArbitrationInput) {
  let urgencia = input.urgencia; let regla: string | null = null;
  if (input.similares >= 6 && input.causaEstructural) { urgencia = atLeast(urgencia, "alta"); regla = "regla_1_patron_estructural"; }
  if (input.cercaEscuela && RISK_NEAR_SCHOOL.includes(input.categoria)) { urgencia = "critica"; regla = "regla_2_cercania_escuela"; }
  if (input.modifier && urgencia !== "critica") urgencia = raiseOnce(urgencia);
  return { urgencia_final: urgencia, prioridad_final: priorityFor(urgencia), regla_gatillada: regla };
}
