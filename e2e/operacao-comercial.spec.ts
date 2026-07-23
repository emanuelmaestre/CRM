import { expect, test } from "@playwright/test";

test.describe("Operação comercial — tarefas, agenda e auditoria", () => {
  test("lista e atualiza uma tarefa com auditoria", async ({ page }) => {
    await page.goto("/tarefas");
    await expect(page.getByTestId("tarefas-page")).toBeVisible();
    await expect(page.getByText("Retornar contato sintético").filter({ visible: true })).toBeVisible();
    const status = page.locator('[data-testid="status-tarefa-64000000-0000-4000-8000-000000000001"]:visible');
    const atual = await status.inputValue();
    const destino = atual === "em_andamento" ? "pendente" : "em_andamento";
    await status.selectOption(destino);
    await expect(status).toHaveValue(destino);
  });

  test("cria e exclui um evento da agenda", async ({ page }, testInfo) => {
    await page.goto("/agenda");
    await expect(page.getByTestId("agenda-page")).toBeVisible();
    await expect(page.getByText("Demonstração com Alice Exemplo")).toBeVisible();
    const titulo = `Evento E2E ${testInfo.project.name}`;
    const inicio = new Date(Date.now() + 86_400_000);
    const valorLocal = new Date(inicio.getTime() - inicio.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
    await page.getByRole("button", { name: "+ Novo evento" }).click();
    await page.locator('[name="titulo"]').fill(titulo);
    await page.locator('[name="inicio"]').fill(valorLocal);
    await page.getByRole("button", { name: "Criar evento" }).click();
    const evento = page.locator("article", { hasText: titulo });
    await expect(evento).toBeVisible();
    page.once("dialog", (dialog) => dialog.accept());
    await evento.getByRole("button", { name: "Excluir" }).click();
    await expect(evento).toHaveCount(0);
  });

  test("admin navega pela trilha imutável", async ({ page }) => {
    await page.goto("/auditoria");
    await expect(page.getByTestId("auditoria-page")).toBeVisible();
    await expect(page.locator('[data-testid^="audit-"]:visible').first()).toBeVisible();
  });
});
