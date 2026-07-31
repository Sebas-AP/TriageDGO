import { describe, expect, it } from "vitest";

import { validateTwilioSignature } from "../../src/mcp/clients/twilio.client";

describe("validateTwilioSignature", () => {
  it("validates an HMAC-SHA1 signature", () => {
    expect(
      validateTwilioSignature({
        authToken: "12345",
        url: "https://example.test/webhooks/whatsapp",
        parameters: { Body: "hola", From: "whatsapp:+5216180000000" },
        signature: "5Ni9/JlBzenN0bQ3MU3cOt076tI=",
      }),
    ).toBe(true);
  });
});
