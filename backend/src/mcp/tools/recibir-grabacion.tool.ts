export interface RecordingPayload { recordingUrl: string; callSid: string; durationSeconds?: number; }
export function parseRecordingPayload(payload: Record<string, string | undefined>): RecordingPayload {
  const recordingUrl = payload.RecordingUrl;
  const callSid = payload.CallSid;
  if (!recordingUrl || !callSid) throw new Error("Payload de grabación incompleto.");
  const duration = payload.RecordingDuration ? Number(payload.RecordingDuration) : undefined;
  if (duration !== undefined && (!Number.isFinite(duration) || duration < 0)) throw new Error("Duración de grabación inválida.");
  return { recordingUrl, callSid, durationSeconds: duration };
}
