import { expect, test } from "@playwright/test";

test("recorrido demo ciudadano y admin", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/");
  await page.getByLabel("Nombre completo").fill("Ana Torres");
  await page.getByLabel("Teléfono").fill("6181234567");
  await page.getByText("Autorizo recibir").click();
  await page.getByRole("button", { name: "Siguiente" }).click();
  await expect(page.getByRole("heading", { name: "¿Dónde ocurre?" })).toBeVisible();

  await page.getByLabel("Busca una calle o lugar").fill("20 de Noviembre");
  await page.getByRole("button", { name: /Avenida 20 de Noviembre/ }).click();
  await page.getByRole("button", { name: "Siguiente" }).click();
  await expect(page.getByRole("heading", { name: "Describe el problema" })).toBeVisible();
  await page.getByLabel("Incluye referencias y cualquier riesgo visible").fill(
    "Hay un cable caído frente a la escuela y está sacando chispas.",
  );
  await page.getByRole("button", { name: "Siguiente" }).click();
  await expect(page.getByRole("heading", { name: "Agrega una fotografía" })).toBeVisible();
  await page.getByRole("button", { name: "Siguiente" }).click();
  await expect(page.getByRole("heading", { name: "Revisa tu reporte" })).toBeVisible();
  await page.getByRole("button", { name: "Enviar reporte" }).click();

  await expect(page.getByText("Reporte enviado")).toBeVisible();
  const folio = await page.getByRole("heading", { level: 1 }).textContent();
  await page.getByRole("link", { name: "Ver consola demo" }).click();
  await page.getByRole("button", { name: "Entrar a la consola" }).click();
  await expect(page.getByRole("heading", { name: "Operación ciudadana bajo control." })).toBeVisible();
  await page.screenshot({ path: "test-results/admin-dashboard.png", fullPage: true });
  await page.getByRole("button", { name: /Bandeja omnicanal/ }).click();
  await expect(page.getByText(folio || "DGO-2026").first()).toBeVisible();
  await expect(page.getByText("Procesamiento inteligente")).toBeVisible();
  await page.screenshot({ path: "test-results/admin-inbox.png", fullPage: true });
});

test("respeta la preferencia de movimiento reducido", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Cuéntanos qué está pasando" })).toBeVisible();

  const duration = await page.locator(".route-stage").evaluate((element) => getComputedStyle(element).animationDuration);
  expect(Number.parseFloat(duration)).toBeLessThanOrEqual(0.001);
});
