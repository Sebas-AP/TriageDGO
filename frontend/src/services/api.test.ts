import { afterEach, describe, expect, it, vi } from "vitest";
import { apiServices } from "./api";

vi.mock("../lib/firebase", () => ({
  firebaseAuth: vi.fn(() => ({ currentUser: { getIdToken: vi.fn().mockResolvedValue("guest-token") } })),
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

  it("mantiene la sesión ciudadana al pedir aclaraciones y serializa respuestas acumuladas", async () => {
    const token = { getIdToken: vi.fn().mockResolvedValue("guest-token") };
    const { firebaseAuth } = await import("../lib/firebase");
    vi.mocked(firebaseAuth).mockReturnValue({ currentUser: token } as never);
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ sessionId: "clar-1", complete: false, questions: ["¿Hay riesgo?"] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(apiServices.reports.requestClarification({ description: "Hay un bache grande frente a la escuela.", answers: [{ question: "¿Qué tamaño?", answer: "No lo sé" }] })).resolves.toMatchObject({ sessionId: "clar-1" });
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/reportes/aclarificacion");
    expect(request.headers).toMatchObject({ Authorization: "Bearer guest-token" });
    expect(JSON.parse(String(request.body))).toEqual({ description: "Hay un bache grande frente a la escuela.", answers: [{ question: "¿Qué tamaño?", answer: "No lo sé" }] });
  });

  it("consulta sólo los reportes de la sesión ciudadana", async () => {
    const token = { getIdToken: vi.fn().mockResolvedValue("guest-token") };
    const { firebaseAuth } = await import("../lib/firebase");
    vi.mocked(firebaseAuth).mockReturnValue({ currentUser: token } as never);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ reports: [{ id: "r-1", folio: "r-1", status: "assigned", createdAt: "2026-01-01", location: { address: "Centro", lat: 24, lng: -104 } }] }), { status: 200 })));
    await expect(apiServices.reports.listMine()).resolves.toHaveLength(1);
  });
});
