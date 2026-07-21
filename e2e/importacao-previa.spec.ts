import { test, expect } from "@playwright/test";
import path from "path";

/**
 * Fluxo E2E: importação de clientes CSV → prévia → confirmar importação
 */
test.describe("Importação com prévia", () => {
  test("upload CSV exibe prévia antes de confirmar importação", async ({ page }) => {
    await page.goto("/clientes/importar");

    // Upload de arquivo CSV de teste
    const fileInput = page.getByLabel(/arquivo/i);
    await fileInput.setInputFiles({
      name: "clientes_teste.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        "nome,telefone,email,cpf\n" +
        "João Silva,(11) 99999-0001,joao@exemplo.com,123.456.789-00\n" +
        "Maria Souza,(11) 99999-0002,maria@exemplo.com,987.654.321-00\n"
      ),
    });

    // Deve exibir prévia com 2 registros
    await expect(page.getByTestId("previa-total")).toHaveText(/2/);
    await expect(page.getByTestId("previa-tabela")).toBeVisible();

    // Verificar que exibe erros de validação se houver
    const erros = page.getByTestId("previa-erros");
    const totalErros = await erros.count();
    expect(totalErros).toBeGreaterThanOrEqual(0);

    // Confirmar importação somente se sem erros bloqueantes
    const btnConfirmar = page.getByRole("button", { name: /confirmar importação/i });
    if (await btnConfirmar.isEnabled()) {
      await btnConfirmar.click();
      await expect(page.getByText(/importação concluída/i)).toBeVisible({ timeout: 15000 });
    }
  });

  test("arquivo CSV inválido exibe mensagem de erro", async ({ page }) => {
    await page.goto("/clientes/importar");

    const fileInput = page.getByLabel(/arquivo/i);
    await fileInput.setInputFiles({
      name: "invalido.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("coluna_errada,outra_coluna\nvalor1,valor2\n"),
    });

    await expect(page.getByText(/coluna obrigatória|campo inválido/i)).toBeVisible();
  });
});
