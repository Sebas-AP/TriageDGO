import { describe, expect, it } from "vitest";

import { estimateAttentionCost } from "../../src/business/services/cost.service";

describe("estimateAttentionCost", () => {
  it("combines WhatsApp, voice and transcription costs without credentials", () => {
    expect(
      estimateAttentionCost({
        whatsappMessages: 2,
        voiceSeconds: 120,
        transcriptionSeconds: 90,
      }),
    ).toEqual({
      currency: "USD",
      total: 0.053,
      breakdown: { whatsapp: 0.01, voice: 0.028, transcription: 0.015 },
    });
  });

  it("rejects negative usage", () => {
    expect(() => estimateAttentionCost({ whatsappMessages: -1 })).toThrow("no puede ser negativo");
  });
});
