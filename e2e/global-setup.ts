import { chromium, type FullConfig } from "@playwright/test";

async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use.baseURL ?? "http://localhost:3000";
  const email = process.env.E2E_USER_EMAIL;
  const password = process.env.E2E_USER_PASSWORD;

  if (!email || !password) {
    console.warn("[E2E] E2E_USER_EMAIL / E2E_USER_PASSWORD não definidos — testes que requerem auth serão pulados.");
    return;
  }

  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto(`${baseURL}/auth/login`);
  await page.getByLabel(/e-mail/i).fill(email);
  await page.getByLabel(/senha/i).fill(password);
  await page.getByRole("button", { name: /entrar/i }).click();
  await page.waitForURL(/\/(dashboard|clientes|vendas)/, { timeout: 15_000 });

  await page.context().storageState({ path: "e2e/.auth/user.json" });
  await browser.close();
}

export default globalSetup;
