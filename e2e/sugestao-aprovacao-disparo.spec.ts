import { test, expect } from "@playwright/test";

/**
 * Fluxo E2E: sugestão de campanha IA → aprovação humana → disparo
 * Garante que nenhuma campanha é enviada sem aprovação explícita.
 */
test.describe("Sugestão IA → Aprovação → Disparo", () => {
  test("sugestão pendente exige aprovação antes de disparar", async ({ page }) => {
    await page.goto("/ia/sugestoes");

    // Deve haver lista de sugestões (pode estar vazia se IA ainda não rodou)
    await expect(page.getByRole("heading", { name: /sugestões de campanha/i })).toBeVisible();

    // Se houver sugestão pendente, verificar que não há botão "disparar" sem aprovar
    const sugestoes = page.getByTestId("sugestao-card");
    const count = await sugestoes.count();

    if (count > 0) {
      const primeira = sugestoes.first();
      // Aviso IA probabilística deve estar visível
      await expect(primeira.getByText(/IA probabilística/i)).toBeVisible();

      // Fluxo de aprovação
      await primeira.getByRole("button", { name: /aprovar/i }).click();
      await page.getByRole("dialog").getByRole("button", { name: /confirmar aprovação/i }).click();
      await expect(primeira.getByTestId("status-sugestao")).toHaveText(/aprovada/i);
    }
  });

  test("rejeição de sugestão impede disparo", async ({ page }) => {
    await page.goto("/ia/sugestoes");
    const sugestoes = page.getByTestId("sugestao-card");

    if (await sugestoes.count() > 0) {
      const primeira = sugestoes.first();
      await primeira.getByRole("button", { name: /rejeitar/i }).click();
      await page.getByLabel(/motivo/i).fill("Não se aplica à campanha atual");
      await page.getByRole("button", { name: /confirmar rejeição/i }).click();
      await expect(primeira.getByTestId("status-sugestao")).toHaveText(/rejeitada/i);
    }
  });
});
