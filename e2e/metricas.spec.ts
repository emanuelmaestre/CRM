import { test, expect } from "@playwright/test";

/**
 * Métricas — a página que substituiu Relatórios.
 * O que se verifica aqui é o esqueleto de leitura: os cinco atos existem e a
 * página não quebra sem dado externo (conta do Mercado Livre desconectada no
 * ambiente de teste é um caminho normal, não um erro).
 */
test.describe("Métricas", () => {
  test("página carrega sem erro 500", async ({ page }) => {
    await page.goto("/metricas");
    await expect(page).not.toHaveTitle(/500|Error/i);
    await expect(page.getByRole("heading", { name: /métricas/i })).toBeVisible();
  });

  test("os cinco blocos de leitura estão presentes", async ({ page }) => {
    await page.goto("/metricas");
    for (const secao of [
      /saúde da operação/i,
      /reputação nos canais/i,
      /marca a marca/i,
      /atendimento/i,
      /recomendações/i,
    ]) {
      await expect(page.getByRole("heading", { name: secao })).toBeVisible({ timeout: 15_000 });
    }
  });

  test("score explica como é calculado", async ({ page }) => {
    await page.goto("/metricas");
    const botao = page.getByRole("button", { name: /como é calculado/i });
    await expect(botao).toBeVisible({ timeout: 15_000 });
    await botao.click();
    await expect(page.getByText(/pilar sem dado não vira zero/i)).toBeVisible();
  });

  test("comparação permite trocar o critério de ordenação", async ({ page }) => {
    await page.goto("/metricas");
    const criterio = page.getByRole("tab", { name: "Faturamento" });
    await expect(criterio).toBeVisible({ timeout: 15_000 });
    await criterio.click();
    await expect(criterio).toHaveAttribute("aria-selected", "true");
  });
});
