import { test, expect } from "@playwright/test";

/**
 * Métricas — o módulo que absorveu Relatórios e, depois, o Painel.
 * A tela é um mosaico de blocos; o card completo só existe quando o bloco é
 * aberto. O que se verifica aqui é esse contrato: os blocos aparecem sem
 * depender de dado externo (conta do Mercado Livre desconectada no ambiente de
 * teste é um caminho normal, não um erro), abrir um bloco monta o card, e o
 * card aberto sobrevive a um recarregamento porque mora na URL.
 */
test.describe("Métricas", () => {
  test("página carrega sem erro 500", async ({ page }) => {
    await page.goto("/metricas");
    await expect(page).not.toHaveTitle(/500|Error/i);
    await expect(page.getByRole("heading", { name: /métricas/i })).toBeVisible();
  });

  test("o mosaico mostra os blocos de leitura", async ({ page }) => {
    await page.goto("/metricas");
    for (const bloco of [/saúde da loja/i, /^marca$/i, /recomendações/i]) {
      await expect(page.getByRole("button", { name: new RegExp(`abrir .*${bloco.source}`, "i") }))
        .toBeVisible({ timeout: 15_000 });
    }
  });

  test("abrir um bloco monta o card completo e Esc devolve ao mosaico", async ({ page }) => {
    await page.goto("/metricas");
    const bloco = page.getByRole("button", { name: /abrir saúde da loja/i });
    await expect(bloco).toBeVisible({ timeout: 15_000 });
    await bloco.click();

    const painel = page.getByRole("dialog");
    await expect(painel).toBeVisible();
    await expect(page).toHaveURL(/\?card=score/);

    // O conteúdo do card só existe depois de abrir — é o ganho do mosaico.
    const explicacao = painel.getByRole("button", { name: /como é calculado/i });
    await expect(explicacao).toBeVisible({ timeout: 15_000 });
    await explicacao.click();
    await expect(page.getByText(/pilar sem dado não vira zero/i)).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(painel).toBeHidden();
    await expect(bloco).toBeVisible();
  });

  test("o card aberto sobrevive ao recarregamento", async ({ page }) => {
    await page.goto("/metricas?card=comparacao");
    const painel = page.getByRole("dialog");
    await expect(painel).toBeVisible({ timeout: 15_000 });

    const criterio = painel.getByRole("tab", { name: "Faturamento" });
    await expect(criterio).toBeVisible({ timeout: 15_000 });
    await criterio.click();
    await expect(criterio).toHaveAttribute("aria-selected", "true");
  });
});
