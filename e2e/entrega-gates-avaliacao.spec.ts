import { expect, test } from "@playwright/test";

// Cobre a ponta de observabilidade do fluxo entrega → gates → avaliação
// (portão de saída da Fase B/§18.1): cada execução de régua — inclusive as
// disparadas por confirmação de entrega — precisa expor status, gate bloqueado
// e motivo no histórico de automações, nunca uma caixa-preta.
test("histórico de automações expõe status, gate e motivo de cada execução", async ({ page }) => {
  await page.goto("/automacoes/historico");
  await expect(page.getByTestId("automacoes-historico")).toBeVisible();

  const tabela = page.getByTestId("automacoes-historico").locator("table");
  const temDados = await tabela.count();

  if (temDados === 0) {
    // Ambiente sem execuções de régua ainda — o estado vazio precisa aparecer, não um erro.
    await expect(page.getByTestId("automacoes-historico")).toContainText(/nenhuma execução/i);
    return;
  }

  const cabecalho = tabela.locator("thead");
  for (const coluna of ["Quando", "Régua", "Status", "Gate", "Motivo"]) {
    await expect(cabecalho).toContainText(coluna);
  }
  const primeiraLinha = tabela.locator("tbody tr").first();
  await expect(primeiraLinha).toBeVisible();
  const celulas = primeiraLinha.locator("td");
  await expect(celulas).toHaveCount(7);
});
