import { test, expect } from "@playwright/test";

/**
 * Fluxo E2E: pedido → baixa de estoque → sincronização
 * Verifica que ao pagar um pedido, o saldo de estoque é deduzido.
 */
test.describe("Pedido → Baixa de estoque → Sync", () => {
  test("criar pedido, marcar como pago e verificar baixa no estoque", async ({ page }) => {
    // 1. Navegar para lista de pedidos
    await page.goto("/vendas/pedidos");
    await expect(page).toHaveTitle(/CRM LEO/);

    // 2. Criar novo pedido
    await page.getByRole("button", { name: /novo pedido/i }).click();
    await page.getByLabel(/cliente/i).fill("Cliente Teste E2E");
    await page.getByRole("option").first().click();
    await page.getByRole("button", { name: /adicionar item/i }).click();
    await page.getByLabel(/produto/i).fill("Produto Teste");
    await page.getByRole("option").first().click();
    await page.getByLabel(/quantidade/i).fill("2");
    await page.getByRole("button", { name: /salvar pedido/i }).click();

    // 3. Verificar criação
    const pedidoLink = page.getByRole("link", { name: /pedido #/i }).first();
    await expect(pedidoLink).toBeVisible();
    await pedidoLink.click();

    // 4. Marcar como pago
    const saldoAntes = await page.getByTestId("estoque-saldo").textContent();
    await page.getByRole("button", { name: /confirmar pagamento/i }).click();
    await page.getByRole("button", { name: /confirmar/i }).click();
    await expect(page.getByTestId("status-pedido")).toHaveText(/pago/i);

    // 5. Ir ao estoque e verificar baixa (Inngest processa via webhook)
    await page.goto("/estoque/produtos");
    const saldoDepois = await page.getByTestId("estoque-saldo").first().textContent();
    expect(Number(saldoDepois)).toBeLessThan(Number(saldoAntes));
  });
});
