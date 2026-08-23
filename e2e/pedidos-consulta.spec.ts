import { expect, test } from "@playwright/test";

test("pedidos conectados são consultáveis e abrem o detalhe", async ({ page }) => {
  await page.goto("/vendas/pedidos");
  // "Sem filtro = sem dado": a lista só aparece depois de escolher uma
  // empresa ou canal (mesmo padrão do mosaico de Métricas).
  await page.getByRole("button", { name: "KARZI" }).click();
  await expect(page.getByTestId("pedidos-lista")).toBeVisible();
  const primeiroPedido = page.getByTestId("pedidos-lista").getByRole("link").first();
  await expect(primeiroPedido).toBeVisible();
  await primeiroPedido.click();
  await expect(page.getByTestId("status-pedido")).toBeVisible();
  await expect(page.getByRole("heading", { name: /pedido #/i })).toBeVisible();
});
