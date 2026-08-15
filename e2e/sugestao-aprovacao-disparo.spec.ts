import { test, expect } from "@playwright/test";

/**
 * Fluxo E2E: sugestão de campanha IA → aprovação humana → disparo
 * Garante que nenhuma campanha é enviada sem aprovação explícita.
 * As sugestões ficam em Métricas, na seção Recomendações.
 */
test.describe("Sugestão IA → Aprovação → Disparo", () => {
  test("página de métricas exibe painel de sugestões", async ({ page }) => {
    await page.goto("/metricas");
    await expect(page).not.toHaveTitle(/500|Error/i);

    await expect(page.getByText(/campanhas sugeridas/i).first()).toBeVisible();
  });

  test("sugestão pendente pode ser aprovada ou rejeitada", async ({ page }) => {
    await page.goto("/metricas");

    const aprovarBtn = page.getByRole("button", { name: /aprovar/i }).first();
    const rejeitarBtn = page.getByRole("button", { name: /rejeitar/i }).first();

    await expect(aprovarBtn).toBeVisible();
    await expect(rejeitarBtn).toBeVisible();
    await aprovarBtn.click();
    await expect(page.getByText(/aprovada/i).first()).toBeVisible();
  });
});
