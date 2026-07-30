import type { Firestore } from "firebase-admin/firestore";

export type Urgencia = "baja" | "media" | "alta" | "critica";
export type Prioridad = "P0" | "P1" | "P2" | "P3";

export interface NuevoTicket {
  reporteId: string;
  categoria: string;
  urgenciaFinal: Urgencia;
  prioridadFinal: Prioridad;
  area: string;
  patronDetectado?: boolean;
  reglaGatillada?: string;
  revisionManual?: boolean;
  escalarA?: string | null;
}
export interface Ticket extends NuevoTicket { id: string; creadoEn: string; acuseEnviado: boolean; }
export interface TicketsRepository { crear(datos: NuevoTicket): Promise<Ticket>; leerPorReporte(reporteId: string): Promise<Ticket | null>; marcarAcuseEnviado(id: string): Promise<void>; }

function toTicket(id: string, data: FirebaseFirestore.DocumentData): Ticket {
  return { id, reporteId: data.reporteId, categoria: data.categoria, urgenciaFinal: data.urgenciaFinal, prioridadFinal: data.prioridadFinal, area: data.area, patronDetectado: data.patronDetectado, reglaGatillada: data.reglaGatillada, revisionManual: data.revisionManual, escalarA: data.escalarA, creadoEn: data.creadoEn, acuseEnviado: data.acuseEnviado };
}

export function createTicketsRepository(db: Firestore): TicketsRepository {
  const collection = db.collection("tickets");
  return {
    async crear(datos) {
      const ref = collection.doc();
      const document = { ...datos, patronDetectado: datos.patronDetectado ?? false, reglaGatillada: datos.reglaGatillada ?? null, revisionManual: datos.revisionManual ?? false, escalarA: datos.escalarA ?? null, acuseEnviado: false, creadoEn: new Date().toISOString() };
      await ref.set(document);
      return toTicket(ref.id, document);
    },
    async leerPorReporte(reporteId) {
      const result = await collection.where("reporteId", "==", reporteId).limit(1).get();
      const found = result.docs[0];
      return found ? toTicket(found.id, found.data()) : null;
    },
    async marcarAcuseEnviado(id) { await collection.doc(id).update({ acuseEnviado: true }); },
  };
}
