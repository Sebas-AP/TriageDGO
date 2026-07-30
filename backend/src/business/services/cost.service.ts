export interface AttentionUsage {
  whatsappMessages?: number;
  voiceSeconds?: number;
  transcriptionSeconds?: number;
}

export interface AttentionCost {
  currency: "USD";
  total: number;
  breakdown: { whatsapp: number; voice: number; transcription: number };
}

// Valores configurables y deliberadamente explícitos: son estimaciones, no facturación de proveedor.
export const COST_RATES = {
  whatsappMessage: 0.005,
  voiceMinute: 0.014,
  transcriptionMinute: 0.01,
} as const;

function usage(value: number | undefined, name: string): number {
  const normalized = value ?? 0;
  if (!Number.isFinite(normalized) || normalized < 0) throw new Error(`${name} no puede ser negativo.`);
  return normalized;
}

function round(value: number): number { return Math.round(value * 1_000_000) / 1_000_000; }

export function estimateAttentionCost(input: AttentionUsage): AttentionCost {
  const whatsapp = usage(input.whatsappMessages, "whatsappMessages") * COST_RATES.whatsappMessage;
  const voice = (usage(input.voiceSeconds, "voiceSeconds") / 60) * COST_RATES.voiceMinute;
  const transcription = (usage(input.transcriptionSeconds, "transcriptionSeconds") / 60) * COST_RATES.transcriptionMinute;
  const breakdown = { whatsapp: round(whatsapp), voice: round(voice), transcription: round(transcription) };
  return { currency: "USD", total: round(whatsapp + voice + transcription), breakdown };
}
