import { expect, test } from "@playwright/test";

test.describe("Autenticação e perfis", () => {
  test("admin acessa a área de configurações", async ({ page }) => {
    await page.goto("/configuracoes");
    await expect(page).toHaveURL(/\/configuracoes$/);
    await expect(page.getByRole("heading", { name: "Configurações" })).toBeVisible();
    await expect(page.getByText("Usuários e perfis")).toBeVisible();
  });

  test("visitante é redirecionado para o login", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/auth\/login/);
  });
});
