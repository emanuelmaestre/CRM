import { test, expect } from "@playwright/test";

// Verifica que a navegação e as páginas principais renderizam
// nos 4 breakpoints definidos no portão de saída da Fase A.
// Requer usuário autenticado — o global setup cria o estado de sessão.

const paginas = [
  { rota: "/admin/saude", titulo: "Saúde do sistema" },
  { rota: "/admin/lgpd", titulo: "Solicitacoes LGPD" },
  { rota: "/admin/consumo-ia", titulo: "Consumo de IA" },
  { rota: "/dashboard", titulo: "Painel" },
  { rota: "/clientes", titulo: "Clientes" },
  { rota: "/estoque", titulo: "Estoque" },
  { rota: "/estoque/alertas", titulo: "Alertas de estoque" },
  { rota: "/vendas", titulo: "Pedidos" },
  { rota: "/vendas/pedidos", titulo: "Pedidos (redirect)" },
  { rota: "/auditoria", titulo: "Auditoria" },
  { rota: "/importacao", titulo: "Importação" },
  { rota: "/inbox", titulo: "Inbox" },
  { rota: "/relatorios", titulo: "Relatórios" },
  { rota: "/configuracoes", titulo: "Configurações" },
  { rota: "/sem-permissao", titulo: "Sem permissão" },
];

test.describe("Navegação responsiva — 4 breakpoints", () => {
  for (const { rota, titulo } of paginas) {
    test(`${titulo} (${rota}) carrega sem erro`, async ({ page, viewport }) => {
      const runtimeErrors: string[] = [];
      page.on("pageerror", (error) => runtimeErrors.push(error.message));
      await page.goto(rota);

      // Não deve haver erro 500 na página
      await expect(page).not.toHaveTitle(/500|Error/i);
      await expect(page).not.toHaveURL(/\/auth\/login/);
      await expect(page.locator("main")).toBeVisible();
      await expect(page.locator("[data-nextjs-dialog]")).toHaveCount(0);
      await expect(page.locator('[data-testid="dashboard-error"], [data-testid="global-error"]')).toHaveCount(0);
      expect(runtimeErrors).toEqual([]);

      const hasHorizontalOverflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth + 1,
      );
      expect(hasHorizontalOverflow).toBe(false);

      // Mobile: bottom nav visível; tablet/desktop: navegação superior visível.
      if (viewport && viewport.width < 768) {
        const bottomNav = page.locator("nav.fixed.bottom-0");
        await expect(bottomNav).toBeVisible();
      } else {
        const topNav = page.locator("header nav");
        await expect(topNav).toBeVisible();
      }
    });
  }
});
