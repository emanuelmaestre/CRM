import { expect, test } from "@playwright/test";

test.describe("CRM Core — clientes e estoque", () => {
  test("abre a ficha 360º de um cliente sintético", async ({ page }) => {
    await page.goto("/clientes");
    await page.getByPlaceholder(/buscar por nome/i).fill("Alice Exemplo");
    const cliente = page
      .locator('[data-testid="clientes-cards"] > div, [data-testid="clientes-table"] tbody tr')
      .filter({ hasText: "Alice Exemplo", visible: true })
      .first();
    await expect(cliente).toBeVisible();
    await cliente.getByRole("button", { name: "VER" }).click();
    await expect(page).toHaveURL(/\/clientes\/40000000-0000-4000-8000-000000000001$/, { timeout: 15_000 });
    await expect(page.getByTestId("cliente-360")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Alice Exemplo" })).toBeVisible();
    await expect(page.getByText("Histórico")).toBeVisible();
  });

  test("exibe o saldo real do livro-razão", async ({ page }) => {
    await page.goto("/estoque");
    await page.getByPlaceholder(/buscar por SKU/i).fill("SYN-KAR-001");
    await expect(page.locator('[data-testid="saldo-SYN-KAR-001"]:visible')).toContainText("18");
  });
});
