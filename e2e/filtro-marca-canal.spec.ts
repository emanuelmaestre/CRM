import { expect, test } from "@playwright/test";

/* Regressão de 26/08/2026: marcar o Mercado Livre selecionava a KARZI
   sozinho e ainda travava a pílula, sem deixar desmarcar. */
test("Mercado Livre não marca a KARZI sozinho e ela continua desmarcável", async ({ page }) => {
  await page.goto("/vendas/pedidos");

  const karzi = page.getByRole("button", { name: "KARZI" });
  const mercadoLivre = page.getByRole("button", { name: /^Mercado Livre/ });
  await expect(karzi).toBeVisible({ timeout: 30_000 });

  await mercadoLivre.click();
  await expect(mercadoLivre).toHaveAttribute("aria-pressed", "true");
  await expect(karzi).toHaveAttribute("aria-pressed", "false");
  await expect(karzi).toHaveAttribute("aria-disabled", "false");

  await karzi.click();
  await expect(karzi).toHaveAttribute("aria-pressed", "true");

  await karzi.click();
  await expect(karzi).toHaveAttribute("aria-pressed", "false");

  await page.screenshot({ path: "test-results/filtro-ml-karzi.png", fullPage: false });
});
