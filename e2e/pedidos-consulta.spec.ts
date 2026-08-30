import { expect, test } from "@playwright/test";

test("pedidos respeitam saúde do canal antes da consulta", async ({ page }) => {
  await page.goto("/vendas/pedidos");
  await expect(page).toHaveURL(/\/vendas$/);

  // "Sem filtro = sem dado": a lista só aparece depois de escolher uma
  // empresa e um canal saudável (mesmo padrão do mosaico de Métricas).
  await page.getByRole("button", { name: "KARZI" }).click();

  const mercadoLivre = page.getByRole("button", { name: "Mercado Livre" });
  const canalDesabilitado =
    (await mercadoLivre.isDisabled()) ||
    (await mercadoLivre.getAttribute("aria-disabled")) === "true";

  if (canalDesabilitado) {
    await expect(mercadoLivre).toHaveAttribute("aria-disabled", "true");
    await expect(page.getByText("Escolha também um canal para ver os pedidos da empresa")).toBeVisible();
    await expect(page.getByTestId("pedidos-lista")).toHaveCount(0);
    return;
  }

  await mercadoLivre.click();
  const lista = page.getByTestId("pedidos-lista");
  // A busca dispara num useEffect após a seleção da marca/canal; em CI já foi
  // visto passar dos 5s padrão pra resolver.
  await expect(lista).toBeVisible({ timeout: 30_000 });

  // Card mobile (md:hidden) tem o link de navegação direto na linha. Tabela
  // desktop (hidden md:block) não: LinhaPedido só revela o Link de detalhe
  // dentro do <tr> quando ele é clicado e expande (onAlternar) — o clique
  // em si não navega. Sem cobrir os dois, o teste só passa em mobile-360.
  const linkDireto = lista.getByRole("link").filter({ visible: true }).first();
  let linkDetalhe = linkDireto;
  if (await linkDireto.isVisible({ timeout: 5_000 }).catch(() => false)) {
    linkDetalhe = linkDireto;
  } else {
    await lista.locator("tbody tr").first().click();
    linkDetalhe = lista.getByRole("link").filter({ visible: true }).first();
  }

  await expect(linkDetalhe).toBeVisible();
  const detalheHref = await linkDetalhe.getAttribute("href");
  expect(detalheHref).toMatch(/^\/vendas\/pedidos\/[^/]+$/);

  await page.goto(detalheHref!);
  await expect(page.getByTestId("status-pedido")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("heading", { name: /pedido #/i })).toBeVisible();
});
