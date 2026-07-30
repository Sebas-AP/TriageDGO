import { describe, expect, it } from "vitest";

import { createCatalogMapsClient, haversineKm } from "../../src/mcp/clients/maps.client";

describe("catalog maps fallback", () => {
  const maps = createCatalogMapsClient([
    { id: "ESC-1", nombre: "Escuela prueba", coordenadas: [24.0, -104.0], tipo: "escuela" },
  ]);

  it("finds nearby schools deterministically", async () => {
    const nearby = await maps.lugaresCercanos(24.001, -104.001, "escuela", 500);
    expect(nearby).toHaveLength(1);
    expect(nearby[0]).toMatchObject({ id: "ESC-1", nombre: "Escuela prueba" });
  });

  it("uses haversine distance", () => {
    expect(haversineKm(24, -104, 24.001, -104.001)).toBeGreaterThan(0);
  });
});
