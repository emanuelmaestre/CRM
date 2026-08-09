import { expect, test } from "@playwright/test";

test.describe("Importação com prévia", () => {
  test("CSV válido exibe o resumo antes de qualquer escrita", async ({ page }) => {
    await page.goto("/importacao");
    await page.getByTestId("arquivo-csv").setInputFiles({
      name: "clientes_teste.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("nome,email,telefone\nCliente Preview,preview.phase-b@example.invalid,11999990000\n"),
    });
    await page.getByRole("button", { name: /pré-visualizar/i }).click();
    await expect(page.getByTestId("previa-resumo")).toBeVisible();
    await expect(page.getByTestId("previa-total")).toContainText("1");
    await expect(page.getByText(/pré-visualização/i).first()).toBeVisible();
  });

  test("CSV sem a coluna obrigatória exibe rejeição", async ({ page }) => {
    await page.goto("/importacao");
    await page.getByTestId("arquivo-csv").setInputFiles({
      name: "invalido.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("coluna_errada,email\nvalor,invalid@example.invalid\n"),
    });
    await page.getByRole("button", { name: /pré-visualizar/i }).click();
    await expect(page.getByTestId("previa-erros")).toBeVisible();
    await expect(page.getByTestId("previa-erros")).toContainText(/nome|obrigat/i);
  });
});
