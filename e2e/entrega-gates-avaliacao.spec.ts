import { test, expect } from "@playwright/test";

/**
 * Fluxo E2E: pedido entregue → gates → disparo de régua de avaliação
 */
test.describe("Entrega → Gates → Régua de avaliação", () => {
  test("marcar pedido como entregue dispara régua de avaliação pós-venda", async ({ page }) => {
    // Navegar para pedido existente com status "enviado"
    await page.goto("/vendas/pedidos");
    await page.getByRole("link", { name: /enviado/i }).first().click();

    // Marcar como entregue
    await page.getByRole("button", { name: /confirmar entrega/i }).click();
    await page.getByRole("button", { name: /confirmar/i }).click();
    await expect(page.getByTestId("status-pedido")).toHaveText(/entregue/i);

    // Verificar que execução de régua foi registrada (tabela regua_execucao)
    await page.goto("/automacoes/historico");
    const entrada = page.getByText(/avaliacao|pedido_entregue/i).first();
    await expect(entrada).toBeVisible({ timeout: 10000 });
  });
});
