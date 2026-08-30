import { expect, test } from "@playwright/test";

test.describe("CRM Core — clientes e estoque", () => {
  test("abre a ficha 360º de um cliente sintético", async ({ page }) => {
    await page.goto("/clientes/40000000-0000-4000-8000-000000000001");
    await expect(page).toHaveURL(/\/clientes\/40000000-0000-4000-8000-000000000001$/, { timeout: 15_000 });
    await expect(page.getByTestId("cliente-360")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Alice Exemplo" })).toBeVisible();
    await expect(page.getByText("Histórico")).toBeVisible();
  });

  test("não inventa saldo de canal desconectado", async ({ page }) => {
    await page.goto("/estoque?marcas=karzi&canais=mercadolivre");
    const buscaSku = page.getByPlaceholder(/buscar por SKU/i);
    await expect(buscaSku).toBeVisible();
    await buscaSku.fill("SYN-KAR-001");
    await expect(page.locator('[data-testid="saldo-SYN-KAR-001"]:visible')).toContainText("0", { timeout: 15_000 });
  });
});
