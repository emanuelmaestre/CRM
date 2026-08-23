import { expect, test } from "@playwright/test";

test("pedidos conectados são consultáveis e abrem o detalhe", async ({ page }) => {
  await page.goto("/vendas/pedidos");
  // "Sem filtro = sem dado": a lista só aparece depois de escolher uma
  // empresa ou canal (mesmo padrão do mosaico de Métricas).
  await page.getByRole("button", { name: "KARZI" }).click();
  await expect(page.getByTestId("pedidos-lista")).toBeVisible();
  const primeiroPedido = page.getByTestId("pedidos-lista").getByRole("link").first();
  // A busca dispara num useEffect após a seleção da marca; em CI já foi
  // visto passar dos 5s padrão pra resolver.
  await expect(primeiroPedido).toBeVisible({ timeout: 30_000 });
  await primeiroPedido.click();
  await expect(page.getByTestId("status-pedido")).toBeVisible();
  await expect(page.getByRole("heading", { name: /pedido #/i })).toBeVisible();
});
