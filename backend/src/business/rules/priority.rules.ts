import type { Priority, Urgency } from "../types";

const levels: Urgency[] = ["baja", "media", "alta", "critica"];
const priorities: Record<Urgency, Priority> = { critica: "P0", alta: "P1", media: "P2", baja: "P3" };
export const priorityFor = (urgency: Urgency): Priority => priorities[urgency];
export const atLeast = (current: Urgency, minimum: Urgency): Urgency => levels.indexOf(current) < levels.indexOf(minimum) ? minimum : current;
export const raiseOnce = (current: Urgency): Urgency => levels[Math.min(levels.indexOf(current) + 1, levels.length - 1)];
