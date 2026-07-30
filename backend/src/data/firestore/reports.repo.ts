// Repositorio Firestore: colección `reportes` (arq.md §6.1).
import type { Firestore } from "firebase-admin/firestore";

export type CanalReporte = "formulario" | "whatsapp" | "llamada";
export type EstadoReporte = "abierto" | "en_proceso" | "resuelto" | "cerrado";

export interface Reporte {
  id: string;
  ciudadanoId: string;
  canal: CanalReporte;
  texto: string;
  coordenadas: [number, number];
  colonia?: string;
  categoria?: string;
  estado: EstadoReporte;
  ticketId: string | null;
  creadoEn: string;
}

export interface NuevoReporte {
  ciudadanoId: string;
  canal: CanalReporte;
  texto: string;
  coordenadas: [number, number];
  colonia?: string;
  categoria?: string;
}

export class ReporteNoEncontradoError extends Error {
  constructor(id: string) {
    super(`No existe un reporte con id "${id}".`);
    this.name = "ReporteNoEncontradoError";
  }
}

export interface ReportsRepository {
  crear(datos: NuevoReporte): Promise<Reporte>;
  leerPorId(id: string): Promise<Reporte | null>;
  listarPorCiudadano(ciudadanoId: string): Promise<Reporte[]>;
  actualizarEstado(id: string, estado: EstadoReporte, ticketId?: string): Promise<Reporte>;
}

const COLLECTION = "reportes";

function toReporte(id: string, data: FirebaseFirestore.DocumentData): Reporte {
  return {
    id,
    ciudadanoId: data.ciudadanoId,
    canal: data.canal,
    texto: data.texto,
    coordenadas: data.coordenadas,
    colonia: data.colonia,
    categoria: data.categoria,
    estado: data.estado,
    ticketId: data.ticketId ?? null,
    creadoEn: data.creadoEn,
  };
}

export function createReportsRepository(db: Firestore): ReportsRepository {
  const coleccion = db.collection(COLLECTION);

  return {
    async crear(datos) {
      const ref = coleccion.doc();
      const documento: Record<string, unknown> = {
        ciudadanoId: datos.ciudadanoId,
        canal: datos.canal,
        texto: datos.texto,
        coordenadas: datos.coordenadas,
        estado: "abierto" satisfies EstadoReporte,
        ticketId: null,
        creadoEn: new Date().toISOString(),
      };
      if (datos.colonia !== undefined) documento.colonia = datos.colonia;
      if (datos.categoria !== undefined) documento.categoria = datos.categoria;

      await ref.set(documento);
      return toReporte(ref.id, documento);
    },

    async leerPorId(id) {
      const snap = await coleccion.doc(id).get();
      if (!snap.exists) return null;
      return toReporte(snap.id, snap.data()!);
    },

    async listarPorCiudadano(ciudadanoId) {
      const snap = await coleccion.where("ciudadanoId", "==", ciudadanoId).get();
      return snap.docs.map((doc) => toReporte(doc.id, doc.data()));
    },

    async actualizarEstado(id, estado, ticketId) {
      const ref = coleccion.doc(id);
      const snap = await ref.get();
      if (!snap.exists) {
        throw new ReporteNoEncontradoError(id);
      }
      const cambios: Record<string, unknown> = { estado };
      if (ticketId !== undefined) cambios.ticketId = ticketId;
      await ref.update(cambios);
      const actualizado = await ref.get();
      return toReporte(actualizado.id, actualizado.data()!);
    },
  };
}
