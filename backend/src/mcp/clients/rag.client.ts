export interface SimilarReport { reporte_id: string; categoria: string; distancia_km: number; similitud?: number; }
export interface RagSearchResponse { similares_encontrados: number; posible_causa_estructural: boolean; ascenso_sugerido: boolean; nota: string; muestras: SimilarReport[]; }
export interface RagClient { buscarReportes(input: { texto: string; lat: number; lon: number; radio_km?: number; dias?: number }): Promise<RagSearchResponse>; }

export function createHttpRagClient(baseUrl: string, fetchFn: typeof fetch = fetch): RagClient {
  return { async buscarReportes(input) { const response = await fetchFn(`${baseUrl.replace(/\/$/, "")}/buscar_reportes`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input), signal: AbortSignal.timeout(5_000) }); if (!response.ok) throw new Error("RAG no disponible."); return response.json() as Promise<RagSearchResponse>; } };
}
