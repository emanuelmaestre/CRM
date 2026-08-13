import { expect, test } from "@playwright/test";

test.describe("Operação comercial — auditoria", () => {
  test("admin navega pela trilha imutável", async ({ page }) => {
    await page.goto("/auditoria");
    await expect(page.getByTestId("auditoria-page")).toBeVisible();
    await expect(page.locator('[data-testid^="audit-"]:visible').first()).toBeVisible();
  });
});
