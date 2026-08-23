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
    await page.getByLabel(/senha/i).fill(password);
    await page.getByRole("button", { name: /entrar/i }).click();
    await page.waitForURL(/\/(dashboard|metricas|clientes|vendas)/, { timeout: 15_000 });

    // /clientes fica atrás de um PIN de 6 dígitos (dados sensíveis, LGPD).
    // Destrava aqui pra a sessão salva já valer pros specs que abrem a ficha
    // do cliente, sem cada um precisar repetir o formulário do PIN.
    const clientesPin = process.env.CLIENTES_PIN;
    if (clientesPin) {
      await page.goto(`${baseURL}/clientes`);
      const pinInput = page.locator("#clientes-pin");
      if (await pinInput.isVisible().catch(() => false)) {
        await pinInput.fill(clientesPin);
        await page.getByRole("button", { name: /entrar/i }).click();
        await expect(page.locator("#clientes-pin")).toBeHidden({ timeout: 10_000 });
      }
    }

    await mkdir(dirname(STORAGE_STATE_PATH), { recursive: true });
    await page.context().storageState({ path: STORAGE_STATE_PATH });
  } finally {
    await browser.close();
  }
}

export default globalSetup;
