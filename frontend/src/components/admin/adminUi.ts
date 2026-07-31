import type { ChannelSource, ClusterStatus, OperationalStatus, Priority } from "../../types";

export const priorityOrder: Priority[] = ["P0", "P1", "P2", "P3"];
export const priorityLabels: Record<Priority, string> = {
  P0: "Crítica",
  P1: "Alta",
  P2: "Media",
  P3: "Baja",
};

export const channelLabels: Record<ChannelSource, string> = {
  form: "Formulario",
  whatsapp: "WhatsApp",
  call: "Llamada",
  manual: "Captura manual",
};
export const channelIcons: Record<ChannelSource, string> = {
  form: "▤",
  whatsapp: "◉",
  call: "☎",
  manual: "✎",
};

export const statusLabels: Record<OperationalStatus, string> = {
  new: "Nuevo",
  review: "En revisión",
  assigned: "Asignado",
  in_progress: "En atención",
  resolved: "Resuelto",
  closed: "Cerrado",
  duplicate: "Duplicado",
  cancelled: "Cancelado",
};

export const clusterStatusLabels: Record<ClusterStatus, string> = {
  detected: "Detectado",
  investigating: "En investigación",
  action_planned: "Acción programada",
  resolved: "Resuelto",
};

export const teams = ["Obras Centro", "Agua y Drenaje", "Servicios Norte", "Atención de Riesgos", "Vialidad"];
export const assignees = ["Laura Martínez", "Miguel Torres", "Ana Salas", "Carlos Herrera", "Mesa de Control"];

export function isActive(status: OperationalStatus) {
  return !["resolved", "closed", "duplicate", "cancelled"].includes(status);
}

export function isOverdue(date?: string) {
  return Boolean(date && new Date(date).getTime() < Date.now());
}

export function relativeTime(date: string) {
  const minutes = Math.max(1, Math.round((Date.now() - new Date(date).getTime()) / 60_000));
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${Math.round(hours / 24)} d`;
}

export function shortDate(date: string) {
  return new Intl.DateTimeFormat("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(date));
}
