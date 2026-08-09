import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "html",
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3001",
    storageState: "e2e/.auth/user.json",
    trace: "on-first-retry",
  },
  projects: [
    // 4 breakpoints de homologação (PRD §15 — Fase A portão de saída)
    {
      name: "mobile-360",
      use: { ...devices["iPhone SE"], browserName: "chromium", viewport: { width: 360, height: 640 } },
    },
    {
      name: "tablet-768",
      use: { ...devices["iPad Mini"], browserName: "chromium", viewport: { width: 768, height: 1024 } },
    },
    {
      name: "notebook-1024",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1024, height: 768 } },
    },
    {
      name: "wide-1920",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1920, height: 1080 } },
    },
  ],
  webServer: {
    command: process.env.CI ? "npm run start" : "npm run dev",
    url: process.env.E2E_BASE_URL ?? "http://localhost:3001",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
