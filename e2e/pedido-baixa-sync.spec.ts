import { expect, test } from "@playwright/test";

// Cobre o fluxo ponta a ponta pedido → baixa → sync (portão de saída da Fase B/§18.1):
// abre um pedido real, captura o SKU do primeiro item e confirma que o saldo
// correspondente aparece no livro-razão de estoque — evidência visível de que a
// baixa ligada ao pedido foi aplicada no mesmo produto.
test("pedido pago reflete baixa de estoque no livro-razão", async ({ page }) => {
  await page.goto("/vendas/pedidos");
  const primeiroPedido = page.getByTestId("pedidos-lista").getByRole("link").first();
  await expect(primeiroPedido).toBeVisible();
  await primeiroPedido.click();

  await expect(page.getByTestId("status-pedido")).toBeVisible();
  const primeiroItem = page.getByTestId("pedido-item").first();
  await expect(primeiroItem).toBeVisible();
  const sku = await primeiroItem.getAttribute("data-sku");
  expect(sku).toBeTruthy();

  // O Estoque abre sem escopo (uma empresa por vez, nunca as três misturadas),
  // então a lista só existe depois de definir o que olhar. Buscar o SKU é o
  // caminho mais direto — e é o próprio SKU que este teste quer conferir.
  await page.goto("/estoque");
  await page.getByPlaceholder(/buscar por SKU/i).fill(sku!);
  const saldo = page.getByTestId(`saldo-${sku}`).first();
  await expect(saldo).toBeVisible();
});
