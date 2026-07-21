import { test, expect } from "@playwright/test";

// Verifica que a navegação e as páginas principais renderizam
// nos 4 breakpoints definidos no portão de saída da Fase A.
// Requer usuário autenticado — configure E2E_BASE_URL + cookies de sessão em CI.

const paginas = [
  { rota: "/dashboard", titulo: "Painel" },
  { rota: "/clientes", titulo: "Clientes" },
  { rota: "/estoque", titulo: "Estoque" },
  { rota: "/vendas", titulo: "Vendas" },
  { rota: "/relatorios", titulo: "Relatórios" },
  { rota: "/configuracoes", titulo: "Configurações" },
];

test.describe("Navegação responsiva — 4 breakpoints", () => {
  for (const { rota, titulo } of paginas) {
    test(`${titulo} (${rota}) carrega sem erro`, async ({ page, viewport }) => {
      await page.goto(rota);

      // Não deve haver erro 500 na página
      await expect(page).not.toHaveTitle(/500|Error/i);

      // Mobile: bottom nav visível; desktop: sidebar visível
      if (viewport && viewport.width < 768) {
        const bottomNav = page.locator("nav.fixed.bottom-0");
        await expect(bottomNav).toBeVisible();
      } else {
        const sidebar = page.locator("aside");
        await expect(sidebar).toBeVisible();
      }
    });
  }
});
