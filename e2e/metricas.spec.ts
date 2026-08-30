import { test, expect } from "@playwright/test";

/**
 * Métricas — o módulo que absorveu Relatórios e, depois, o Painel.
 * A tela é um mosaico de blocos; o card completo só existe quando o bloco é
 * aberto. O que se verifica aqui é esse contrato: os blocos aparecem sem
 * depender de dado externo (conta do Mercado Livre desconectada no ambiente de
 * teste é um caminho normal, não um erro), abrir um bloco monta o card, e o
 * card aberto sobrevive a um recarregamento porque mora na URL.
 *
 * Os rótulos abaixo (titulo dos blocos em src/config/metricas.json:mosaico.blocos)
 * mudaram numa reescrita de copy — "Saúde da Loja" virou "Pontuação da loja",
 * "Recomendações" (bloco acoes) saiu da grade do mosaico. Os textos aqui
 * seguem o que está de fato em mosaico.tsx/bloco.tsx hoje.
 */
test.describe("Métricas", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("crm-leo:coachmarks:mosaico:v1", "seen");
    });
  });

  test("página carrega sem erro 500", async ({ page }) => {
    await page.goto("/metricas");
    await expect(page).not.toHaveTitle(/500|Error/i);
    // A página não tem PageHeader/heading próprio — é só o mosaico direto.
    // Um bloco de leitura visível é a prova de que carregou de verdade.
    await expect(page.getByRole("button", { name: /abrir pontuação da loja/i })).toBeVisible({ timeout: 15_000 });
  });

  test("o mosaico mostra os blocos de leitura", async ({ page }) => {
    await page.goto("/metricas");
    // Score, Marca e Reposição são incondicionais; Publicações só existe com
    // marca conectada ao ML, por isso fica fora desta checagem.
    for (const bloco of [/pontuação da loja/i, /marca/i, /repor em breve/i]) {
      await expect(page.getByRole("button", { name: new RegExp(`abrir .*${bloco.source}`, "i") }))
        .toBeVisible({ timeout: 15_000 });
    }
  });

  test("abrir um bloco monta o card completo e Esc devolve ao mosaico", async ({ page }) => {
    await page.goto("/metricas");
    const bloco = page.getByRole("button", { name: /abrir pontuação da loja/i });
    await expect(bloco).toBeVisible({ timeout: 15_000 });

    // Abrir um card é interação local. Uma navegação RSC para a própria página
    // repetiria todas as consultas do mosaico antes de o diálogo aparecer.
    const navegacoesRsc: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "GET" && request.headers().rsc === "1" && request.url().includes("/metricas")) {
        navegacoesRsc.push(request.url());
      }
    });
    await bloco.click();

    const painel = page.getByRole("dialog");
    await expect(painel).toBeVisible();
    await expect(page).toHaveURL(/\?card=score/);
    expect(navegacoesRsc).toEqual([]);

    // O conteúdo do card só existe depois de abrir — é o ganho do mosaico.
    const explicacao = painel.getByRole("button", { name: /entenda o painel pontuação da loja/i });
    await expect(explicacao).toBeVisible({ timeout: 15_000 });
    await explicacao.click();
    await expect(page.getByText(/pilar sem dado sai da conta/i)).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(painel).toBeHidden();
    await expect(bloco).toBeVisible();
  });

  test("o card aberto sobrevive ao recarregamento", async ({ page }) => {
    await page.goto("/metricas?card=comparacao");
    const painel = page.getByRole("dialog");
    await expect(painel).toBeVisible({ timeout: 15_000 });

    const criterio = painel.getByRole("tab", { name: "Valor médio por pedido" });
    await expect(criterio).toBeVisible({ timeout: 15_000 });
    await criterio.click();
    await expect(criterio).toHaveAttribute("aria-selected", "true");
  });
});
