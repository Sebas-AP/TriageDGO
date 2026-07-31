import {
  ReporteNoEncontradoError,
  type NuevoReporte,
  type Reporte,
  type ReportsRepository,
} from "../../src/data/firestore/reports.repo";

export function createFakeReportsRepository(): ReportsRepository {
  const store = new Map<string, Reporte>();
  let seq = 0;

  return {
    async crear(datos: NuevoReporte) {
      const id = `FAKE-${++seq}`;
      const reporte: Reporte = {
        id,
        ciudadanoId: datos.ciudadanoId,
        canal: datos.canal,
        texto: datos.texto,
        coordenadas: datos.coordenadas,
        colonia: datos.colonia,
        categoria: datos.categoria,
        estado: "abierto",
        ticketId: null,
        creadoEn: new Date().toISOString(),
      };
      store.set(id, reporte);
      return reporte;
    },
    async leerPorId(id) {
      return store.get(id) ?? null;
    },
    async listarPorCiudadano(ciudadanoId) {
      return [...store.values()].filter((reporte) => reporte.ciudadanoId === ciudadanoId);
    },
    async listarRecientes(limite) {
      return [...store.values()]
        .sort((a, b) => b.creadoEn.localeCompare(a.creadoEn))
        .slice(0, limite);
    },
    async actualizarEstado(id, estado, ticketId) {
      const found = store.get(id);
      if (!found) throw new ReporteNoEncontradoError(id);
      const actualizado = { ...found, estado, ...(ticketId !== undefined ? { ticketId } : {}) };
      store.set(id, actualizado);
      return actualizado;
    },
  };
}
