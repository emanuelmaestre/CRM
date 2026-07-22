import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { chromium, type FullConfig } from "@playwright/test";

const STORAGE_STATE_PATH = "e2e/.auth/user.json";

async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use.baseURL ?? "http://localhost:3000";
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
    await page.waitForURL(/\/(dashboard|clientes|vendas)/, { timeout: 15_000 });

    await mkdir(dirname(STORAGE_STATE_PATH), { recursive: true });
    await page.context().storageState({ path: STORAGE_STATE_PATH });
  } finally {
    await browser.close();
  }
}

export default globalSetup;
