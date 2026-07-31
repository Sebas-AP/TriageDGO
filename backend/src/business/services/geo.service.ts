import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { GeoGateway } from "../orchestrator/supervisor";
import type { Report } from "../types";
const haversine = (a: [number, number], b: [number, number]) => { const r = 6371; const dLat = (b[0] - a[0]) * Math.PI / 180; const dLon = (b[1] - a[1]) * Math.PI / 180; const x = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * Math.PI / 180) * Math.cos(b[0] * Math.PI / 180) * Math.sin(dLon / 2) ** 2; return 2 * r * Math.asin(Math.sqrt(x)); };
export const geoService: GeoGateway = {
  async schoolNear(coordinates) { const file = process.env.SCHOOLS_PATH ?? resolve(process.cwd(), "../assets/escuelas.json"); const data = JSON.parse(await readFile(file, "utf8")); return data.escuelas.find((s: { nombre: string; coordenadas: [number, number] }) => haversine(coordinates, s.coordenadas) <= .5)?.nombre; },
  async weatherAggravates(report: Report) { if (report.texto && !/drenaje|coladera/i.test(report.texto)) return false; const [lat, lon] = report.coordenadas; const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=precipitation&forecast_days=1`); if (!response.ok) return false; const data = await response.json() as { hourly?: { precipitation?: number[] } }; return Boolean(data.hourly?.precipitation?.slice(0, 6).some((v) => v >= .1)); },
};
