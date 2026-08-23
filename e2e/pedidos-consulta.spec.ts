import { expect, test } from "@playwright/test";

test("pedidos conectados são consultáveis e abrem o detalhe", async ({ page }) => {
  await page.goto("/vendas/pedidos");
  // "Sem filtro = sem dado": a lista só aparece depois de escolher uma
  // empresa ou canal (mesmo padrão do mosaico de Métricas).
  await page.getByRole("button", { name: "KARZI" }).click();
  const lista = page.getByTestId("pedidos-lista");
  // A busca dispara num useEffect após a seleção da marca; em CI já foi
  // visto passar dos 5s padrão pra resolver.
  await expect(lista).toBeVisible({ timeout: 30_000 });

  // Card mobile (md:hidden) tem o link de navegação direto na linha. Tabela
  // desktop (hidden md:block) não: LinhaPedido só revela o Link de detalhe
  // dentro do <tr> quando ele é clicado e expande (onAlternar) — o clique
  // em si não navega. Sem cobrir os dois, o teste só passa em mobile-360.
  const linkDireto = lista.getByRole("link").filter({ visible: true }).first();
  if (await linkDireto.isVisible({ timeout: 5_000 }).catch(() => false)) {
    await linkDireto.click();
  } else {
    await lista.locator("tbody tr").first().click();
    await lista.getByRole("link").filter({ visible: true }).first().click();
  }

  await expect(page.getByTestId("status-pedido")).toBeVisible();
  await expect(page.getByRole("heading", { name: /pedido #/i })).toBeVisible();
});
