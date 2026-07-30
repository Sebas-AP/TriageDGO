/** Run with Firebase emulator environment variables set; never points at production by default. */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Firestore } from "firebase-admin/firestore";

type HistoricalReport = { reporte_id: string; timestamp: string; categoria: string; colonia: string; coordenadas: [number, number]; texto: string; ciudadano_id: string; estado: string };
type School = { id: string; nombre: string; colonia: string; coordenadas: [number, number] };

export async function seedEmulator(db: Firestore, assetsPath: string): Promise<void> {
  const historical = (await readFile(join(assetsPath, "reportes_historicos.jsonl"), "utf8")).split("\n").filter(Boolean).map((line) => JSON.parse(line) as HistoricalReport);
  const schools = JSON.parse(await readFile(join(assetsPath, "escuelas.json"), "utf8")) as { escuelas: School[] };
  const batch = db.batch();
  for (const report of historical) batch.set(db.collection("reportes").doc(report.reporte_id), { ciudadanoId: report.ciudadano_id, canal: "formulario", texto: report.texto, coordenadas: report.coordenadas, colonia: report.colonia, categoria: report.categoria, estado: report.estado, ticketId: null, creadoEn: report.timestamp });
  for (const school of schools.escuelas) batch.set(db.collection("escuelas").doc(school.id), school);
  await batch.commit();
}
