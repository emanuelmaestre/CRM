import { expect, test } from "@playwright/test";

test("pedidos conectados são consultáveis e abrem o detalhe", async ({ page }) => {
  await page.goto("/vendas/pedidos");
  await expect(page.getByRole("heading", { name: /pedidos conectados/i })).toBeVisible();
  const primeiroPedido = page.getByTestId("pedidos-lista").getByRole("link").first();
  await expect(primeiroPedido).toBeVisible();
  await primeiroPedido.click();
  await expect(page.getByTestId("status-pedido")).toBeVisible();
  await expect(page.getByRole("heading", { name: /pedido #/i })).toBeVisible();
});
