import { describe, expect, it } from "vitest";

import { NuevoReporteSchema } from "../../src/presentation/schemas";

describe("NuevoReporteSchema", () => {
  it("acepta un reporte válido", () => {
    const result = NuevoReporteSchema.safeParse({
      ciudadanoId: "ciudadano-1",
      canal: "formulario",
      texto: "Bache grande en la calle Hidalgo",
      coordenadas: [24.02, -104.67],
    });
    expect(result.success).toBe(true);
  });

  it("rechaza coordenadas fuera de rango", () => {
    const result = NuevoReporteSchema.safeParse({
      ciudadanoId: "ciudadano-1",
      canal: "formulario",
      texto: "Bache",
      coordenadas: [200, -104.67],
    });
    expect(result.success).toBe(false);
  });

  it("rechaza un canal no reconocido", () => {
    const result = NuevoReporteSchema.safeParse({
      ciudadanoId: "ciudadano-1",
      canal: "telegrama",
      texto: "Bache",
      coordenadas: [24.02, -104.67],
    });
    expect(result.success).toBe(false);
  });
});
