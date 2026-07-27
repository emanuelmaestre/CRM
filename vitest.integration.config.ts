import { defineConfig } from "vitest/config";
import fs from "node:fs";
import path from "node:path";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

// @next/env nunca lê .env.local quando NODE_ENV=test (comportamento oficial do
// Next.js), mas as variáveis locais de integração (ex.: DEFAULT_ORG_ID) só
// existem em .env.local. Preenche o que faltar sem sobrescrever o processo.
function loadDotEnvLocalFallback() {
  const envLocalPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envLocalPath)) return;

  for (const linha of fs.readFileSync(envLocalPath, "utf8").split("\n")) {
    const trimmed = linha.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separador = trimmed.indexOf("=");
    if (separador === -1) continue;
    const chave = trimmed.slice(0, separador).trim();
    if (!chave || process.env[chave] !== undefined) continue;
    const valor = trimmed.slice(separador + 1).trim().replace(/^["']|["']$/g, "");
    process.env[chave] = valor;
  }
}

loadDotEnvLocalFallback();

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/test/integration/**/*.integration.test.ts"],
    fileParallelism: false,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
