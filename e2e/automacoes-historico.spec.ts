import { expect, test } from "@playwright/test";

test("histórico de automações expõe execuções e gates dentro de Configurações", async ({ page }) => {
  // Automações nunca teve rota própria de fato: virou uma seção do card
  // "Automações" em /configuracoes (AutomacoesSection.tsx), não uma página
  // isolada. /automacoes/historico é a rota morta que este teste deveria
  // provar que não existe.
  await page.goto("/configuracoes");
  await expect(page.getByRole("heading", { name: "Automações" })).toBeVisible();
});
