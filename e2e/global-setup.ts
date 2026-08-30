import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { chromium, expect, type FullConfig } from "@playwright/test";

const STORAGE_STATE_PATH = "e2e/.auth/user.json";

async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use.baseURL ?? "http://localhost:3001";
  const email = process.env.E2E_USER_EMAIL;
  const password = process.env.E2E_USER_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "[E2E] Defina E2E_USER_EMAIL e E2E_USER_PASSWORD para validar as rotas autenticadas da Fase A.",
    );
  }

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();

    await page.goto(`${baseURL}/auth/login`);
    await page.getByLabel(/e-mail/i).fill(email);
    // Alvo explícito no input: o formulário ganhou um botão "Mostrar senha"
    // dentro do mesmo campo, e getByLabel(/senha/i) passou a casar os dois —
    // strict mode violation que derrubava todo o setup autenticado antes de
    // qualquer spec rodar.
    await page.locator("input#senha").fill(password);
    await page.getByRole("button", { name: /^entrar$/i }).click();
    await page.waitForURL(/\/(dashboard|metricas|clientes|vendas)/, { timeout: 15_000 });

    // /clientes fica atrás de um PIN de 6 dígitos (dados sensíveis, LGPD).
    // Destrava aqui pra a sessão salva já valer pros specs que abrem a ficha
    // do cliente, sem cada um precisar repetir o formulário do PIN.
    const clientesPin = process.env.CLIENTES_PIN;
    if (clientesPin) {
      await page.goto(`${baseURL}/clientes`);
      const pinInput = page.locator("#clientes-pin");
      const buscaClientes = page.getByPlaceholder(/buscar por nome/i);
      const precisaDestravarClientes = await Promise.race([
        pinInput.waitFor({ state: "visible", timeout: 15_000 }).then(() => true),
        buscaClientes.waitFor({ state: "visible", timeout: 15_000 }).then(() => false),
      ]).catch(() => false);

      if (precisaDestravarClientes) {
        const entrarComPin = page.getByRole("button", { name: /^entrar$/i });
        await expect(pinInput).toBeEditable({ timeout: 15_000 });
        for (let tentativa = 0; tentativa < 3 && !(await entrarComPin.isEnabled().catch(() => false)); tentativa += 1) {
          await pinInput.fill("");
          await pinInput.pressSequentially(clientesPin, { delay: 20 });
          await page.waitForTimeout(250);
        }
        await expect(entrarComPin).toBeEnabled({ timeout: 5_000 });
        await entrarComPin.click();
        // O gate é decidido no servidor (cookie + verificarCookiePin em
        // layout.tsx), não em estado de cliente — então, em vez de confiar
        // no router.refresh() completar dentro da mesma render (já visto
        // travar em CI sem erro nem timeout claro), um reload direto é
        // determinístico: se o cookie foi gravado, o SSR já não mostra o
        // gate, ponto.
        await page.waitForTimeout(1_500);
        await page.reload();
        await expect(page.locator("#clientes-pin")).toBeHidden({ timeout: 15_000 });
      }
      await expect(buscaClientes).toBeVisible({ timeout: 15_000 });
    }

    await mkdir(dirname(STORAGE_STATE_PATH), { recursive: true });
    await page.context().storageState({ path: STORAGE_STATE_PATH });
  } finally {
    await browser.close();
  }
}

export default globalSetup;
