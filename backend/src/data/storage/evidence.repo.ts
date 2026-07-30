import type { Bucket } from "@google-cloud/storage";

export type EvidenceKind = "foto" | "video" | "llamada" | "nota_voz";
export interface EvidenceUpload { reporteId: string; kind: EvidenceKind; fileName: string; contentType: string; bytes: Buffer; }
export interface EvidenceRepository { subir(upload: EvidenceUpload): Promise<{ path: string; signedUrl: string }>; }

function safeSegment(value: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value)) throw new Error("Nombre de archivo inválido.");
  return value;
}

export function evidencePath(reporteId: string, kind: EvidenceKind, fileName: string): string {
  const id = safeSegment(reporteId);
  const name = safeSegment(fileName);
  const root = kind === "foto" || kind === "video" ? "evidencias" : "audio";
  return `${root}/${id}/${kind}-${name}`;
}

export function createEvidenceRepository(bucket: Bucket): EvidenceRepository {
  return { async subir(upload) { const path = evidencePath(upload.reporteId, upload.kind, upload.fileName); const file = bucket.file(path); await file.save(upload.bytes, { contentType: upload.contentType, resumable: false }); const [signedUrl] = await file.getSignedUrl({ action: "read", expires: Date.now() + 15 * 60 * 1000 }); return { path, signedUrl }; } };
}
