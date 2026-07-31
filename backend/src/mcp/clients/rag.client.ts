export interface SimilarReport {
  reporte_id: string;
  categoria: string;
  distancia_km: number;
  similitud?: number;
}

export interface RagSearchResponse {
  similares_encontrados: number;
  posible_causa_estructural: boolean;
  ascenso_sugerido: boolean;
  nota: string;
  muestras: SimilarReport[];
}

export interface RagPaymentResponse {
  encontrado: boolean;
  clave_catastral?: string;
  ubicacion?: string;
  al_corriente?: boolean;
  actualizado_en?: string;
  nota: string;
}

/** Client interface for the RAG microservice. */
export interface RagClient {
  buscarReportes(input: { texto: string; lat: number; lon: number; radio_km?: number; dias?: number }): Promise<RagSearchResponse>;
  buscarPagos(input: { clave_catastral?: string; ubicacion?: string }): Promise<RagPaymentResponse>;
  indexarReporte(reporteId: string, token: string): Promise<{ reportes: number }>;
  reindexar(token: string): Promise<{ reportes: number; predial: number }>;
}

/**
 * Creates an HTTP client for the RAG microservice.
 *
 * @param baseUrl - RAG service URL (e.g., "http://localhost:8001")
 * @param fetchFn - Optional fetch implementation (for testing)
 */
export function createHttpRagClient(baseUrl: string, fetchFn: typeof fetch = fetch): RagClient {
  const request = async <T>(path: string, body?: unknown, token?: string): Promise<T> => {
    const response = await fetchFn(`${baseUrl.replace(/\/$/, "")}${path}`, { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(5_000) });
    if (!response.ok) throw new Error("RAG no disponible.");
    return response.json() as Promise<T>;
  };
  return {
    buscarReportes: (input) => request<RagSearchResponse>("/buscar_reportes", input),
    buscarPagos: (input) => request<RagPaymentResponse>("/buscar_pagos", input),
    indexarReporte: (reporteId, token) => request<{ reportes: number }>(`/index/reportes/${encodeURIComponent(reporteId)}`, undefined, token),
    reindexar: (token) => request<{ reportes: number; predial: number }>("/index/rebuild", { force: true }, token),
  };
}
