import { expect, test } from "@playwright/test";

test("histórico de automações expõe execuções e gates sem rota morta", async ({ page }) => {
  await page.goto("/automacoes/historico");
  await expect(page.getByRole("heading", { name: /histórico de automações/i })).toBeVisible();
  await expect(page.getByTestId("automacoes-historico")).toBeVisible();
});
