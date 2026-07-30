import type { RagClient, RagSearchResponse } from "../clients/rag.client";

export interface BuscarSimilaresInput { texto: string; lat: number; lon: number; radio_km?: number; dias?: number; }
export class BuscarSimilaresTool { constructor(private readonly rag: RagClient) {} ejecutar(input: BuscarSimilaresInput): Promise<RagSearchResponse> { return this.rag.buscarReportes(input); } }
