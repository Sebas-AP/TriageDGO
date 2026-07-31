import { afterEach, describe, expect, it, vi } from "vitest";
import { apiServices } from "./api";

vi.mock("../lib/firebase", () => ({
  firebaseAuth: vi.fn(),
}));

describe("servicios API de reportes", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("envía el reporte multipart con una Idempotency-Key y conserva la respuesta camelCase", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ reportId: "report-42", folio: "DGO-2026-0042", status: "received" }), {
        status: 202,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      apiServices.reports.submit({
        citizenName: "Ana Torres",
        phone: "6181234567",
        consent: true,
        description: "Hay un cable caído que bloquea la banqueta.",
        location: { address: "Zona Centro", lat: 24.0277, lng: -104.6532, placeId: "place-1" },
      }),
    ).resolves.toEqual({ reportId: "report-42", folio: "DGO-2026-0042", status: "received" });

    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(request.method).toBe("POST");
    expect(request.headers).toMatchObject({ "Idempotency-Key": expect.any(String) });
    expect((request.headers as Record<string, string>)["Idempotency-Key"]).not.toHaveLength(0);
    expect(request.body).toBeInstanceOf(FormData);
    expect((request.body as FormData).get("location")).toBe(
      JSON.stringify({ address: "Zona Centro", lat: 24.0277, lng: -104.6532, placeId: "place-1" }),
    );
  });

  it("expone el mensaje seguro del contrato cuando el backend rechaza un reporte", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: "La fotografía no cumple los requisitos." }), {
          status: 422,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    await expect(
      apiServices.reports.requestClarification("Hay un bache grande frente a la escuela.", 2),
    ).rejects.toThrow("La fotografía no cumple los requisitos.");
  });
});
