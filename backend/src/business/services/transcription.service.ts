export interface WhisperClient { transcribir(audio: Buffer, fileName: string, contentType: string): Promise<{ texto: string; duracionSegundos?: number }>; }
export class TranscriptionService { constructor(private readonly client: WhisperClient) {} transcribir(audio: Buffer, fileName: string, contentType: string) { return this.client.transcribir(audio, fileName, contentType); } }

export class UnconfiguredWhisperClient implements WhisperClient {
  async transcribir(): Promise<{ texto: string }> { throw new Error("Whisper no está configurado: define WHISPER_API_KEY."); }
}

export function createWhisperHttpClient(apiKey: string, fetchFn: typeof fetch = fetch): WhisperClient {
  return { async transcribir(audio, fileName, contentType) {
    const body = new FormData();
    body.append("model", "whisper-1");
    body.append("file", new Blob([audio], { type: contentType }), fileName);
    const response = await fetchFn("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { authorization: `Bearer ${apiKey}` }, body, signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error("Whisper no disponible.");
    const payload = await response.json() as { text?: string };
    if (!payload.text) throw new Error("Whisper devolvió una respuesta inválida.");
    return { texto: payload.text };
  } };
}
