import { expect, test } from "@playwright/test";

test.describe("CRM Core — clientes, estoque e funil", () => {
  test("abre a ficha 360º de um cliente sintético", async ({ page }) => {
    await page.goto("/clientes");
    await page.getByPlaceholder(/buscar por nome/i).fill("Alice Exemplo");
    await page.getByRole("button", { name: "Ver ficha" }).filter({ visible: true }).click();
    await expect(page).toHaveURL(/\/clientes\/40000000-0000-4000-8000-000000000001$/, { timeout: 15_000 });
    await expect(page.getByTestId("cliente-360")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Alice Exemplo" })).toBeVisible();
    await expect(page.getByText("Timeline unificada")).toBeVisible();
  });

  test("exibe o saldo real do livro-razão", async ({ page }) => {
    await page.goto("/estoque");
    await page.getByPlaceholder(/buscar por SKU/i).fill("SYN-KAR-001");
    await expect(page.locator('[data-testid="saldo-SYN-KAR-001"]:visible')).toContainText("18");
  });

  test("move oportunidade sem depender de drag-and-drop", async ({ page }) => {
    await page.goto("/vendas");
    const select = page.getByTestId("move-63000000-0000-4000-8000-000000000001");
    await expect(select).toBeVisible();
    const current = await select.inputValue();
    const options = await select.locator("option").evaluateAll((items) => items.map((item) => (item as HTMLOptionElement).value));
    const target = options.find((value) => value !== current);
    expect(target).toBeTruthy();
    await select.selectOption(target!);
    await expect(select).toHaveValue(target!);
  });
});
