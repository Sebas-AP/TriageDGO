import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/app";

describe("realtime and maps UI endpoints", () => {
  it("provides deterministic maps fallbacks under frontend paths", async () => {
    const app = createApp();
    expect((await request(app).get("/maps/autocomplete?q=Hidalgo")).body).toEqual({ predictions: [], provider: "fallback" });
    expect((await request(app).get("/maps/geocode?address=Hidalgo%201")).body).toEqual({ result: null, provider: "fallback" });
  });

  it("does not allow unauthenticated or citizen SSE subscriptions", async () => {
    const unauthenticated = createApp({ authenticate: async () => { throw new Error("UNAUTHENTICATED"); } });
    expect((await request(unauthenticated).get("/admin/eventos")).status).toBe(401);
    const citizen = createApp({ authenticate: async () => ({ uid: "c", role: "invitado" as const, areas: [] }) });
    expect((await request(citizen).get("/admin/eventos")).status).toBe(403);
  });
});
