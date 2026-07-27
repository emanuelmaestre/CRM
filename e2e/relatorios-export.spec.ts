import { test, expect } from "@playwright/test";

/**
 * Fase C — Relatórios exportáveis e painel de inteligência
 */
test.describe("Relatórios — Exportação e Inteligência", () => {
  test("página carrega sem erro 500", async ({ page }) => {
    await page.goto("/relatorios");
    await expect(page).not.toHaveTitle(/500|Error/i);
    await expect(page.getByRole("heading", { name: /relatórios/i })).toBeVisible();
  });

  test("KPI cards renderizam", async ({ page }) => {
    await page.goto("/relatorios");
    await page.waitForSelector("text=Receita (30 dias)", { timeout: 15_000 });
    await expect(page.getByText("Pedidos (30 dias)")).toBeVisible();
    await expect(page.getByText("Canais ativos")).toBeVisible();
    await expect(page.getByText("Consumo IA (mês)")).toBeVisible();
  });

  test("botões de export CSV/XLSX/PDF visíveis quando há dados", async ({ page }) => {
    await page.goto("/relatorios");
    // Aguarda carregamento
    await page.waitForSelector("text=Vendas por canal", { timeout: 15_000 });

    await expect(page.getByRole("button", { name: "CSV" })).toBeVisible();
    await expect(page.getByRole("button", { name: "XLSX" })).toBeVisible();
    await expect(page.getByRole("button", { name: "PDF" })).toBeVisible();
    await expect(page.getByRole("button", { name: /documento executivo/i })).toBeVisible();
  });

  test("painel de sugestões de campanha existe", async ({ page }) => {
    await page.goto("/relatorios");
    await page.waitForSelector("text=Sugestões de campanha", { timeout: 15_000 });
    await expect(page.getByText(/rfm v2/i)).toBeVisible();
  });
});

test.describe("RFM Scoring — fórmulas versionadas", () => {
  test("calcularScoreCliente v2 produz segmentos corretos", async () => {
    // Teste unitário inline — importa a função diretamente
    const { calcularScoreCliente } = await import("../src/modules/scoring/domain/rfm");

    const campeao = calcularScoreCliente({ diasDesdeUltimaCompra: 2, totalCompras: 20, valorTotalGasto: 5000, intervalMedioEntrCompras: 15 }, "v2");
    expect(campeao.churnRisk).toBeLessThanOrEqual(25);
    expect(campeao.explicacao).toContain("Campeão");
    expect(campeao.versaoFormula).toBe("v2");

    const perdido = calcularScoreCliente({ diasDesdeUltimaCompra: 200, totalCompras: 1, valorTotalGasto: 50, intervalMedioEntrCompras: null }, "v2");
    expect(perdido.churnRisk).toBeGreaterThanOrEqual(80);
    expect(perdido.explicacao).toContain("Perdido");

    // v1 ainda funciona
    const v1 = calcularScoreCliente({ diasDesdeUltimaCompra: 5, totalCompras: 5, valorTotalGasto: 500, intervalMedioEntrCompras: null }, "v1");
    expect(v1.versaoFormula).toBe("v1");
  });
});
