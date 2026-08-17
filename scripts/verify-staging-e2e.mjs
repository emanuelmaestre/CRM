import { randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";
import { resolveDatabaseConnectionString } from "./database-url.mjs";

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require("@next/env");
const playwrightCli = require.resolve("@playwright/test/cli");

loadEnvConfig(process.cwd());

const requiredVariables = [
  "STAGING_E2E_BASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "DATABASE_URL",
  "DEFAULT_ORG_ID",
];

for (const variable of requiredVariables) {
  if (!process.env[variable]) {
    throw new Error(`${variable} não configurada para verificar o staging.`);
  }
}

const baseUrl = new URL(process.env.STAGING_E2E_BASE_URL);
if (!baseUrl.hostname.includes("git-dev") || baseUrl.hostname === "elisa-lima.vercel.app") {
  throw new Error("A verificação autenticada só pode executar no Preview estável da branch dev.");
}
if (process.env.STAGING_E2E_CONFIRMATION !== "create-temporary-user") {
  throw new Error("Confirme o staging com STAGING_E2E_CONFIRMATION=create-temporary-user.");
}

const email = `fase-a-${randomUUID()}@example.invalid`;
const password = randomBytes(32).toString("base64url");
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const sql = postgres(resolveDatabaseConnectionString(process.env.DATABASE_URL), { max: 1, prepare: false, connect_timeout: 10 });

let authUserId;
let testExitCode = 1;

async function removeTemporaryUsers() {
  const users = await sql`
    select id::text as id
    from public.app_user
    where nome = 'Verificação temporária Fase A'
      and email like 'fase-a-%@example.invalid'
  `;
  if (users.length === 0) return;

  for (const user of users) {
    await sql`
      update public.app_user
      set email = ${`removed-${user.id}@example.invalid`},
          nome = 'Usuário temporário removido',
          ativo = false,
          atualizado_em = now()
      where id = ${user.id}
    `;
    const { error } = await supabase.auth.admin.deleteUser(user.id);
    if (error) console.error("Falha ao remover usuário temporário do Auth:", error.message);
  }
}

async function runPlaywright(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [playwrightCli, "test", ...args], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        E2E_BASE_URL: baseUrl.origin,
        E2E_USER_EMAIL: email,
        E2E_USER_PASSWORD: password,
      },
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
}

try {
  await removeTemporaryUsers();
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`Não foi possível criar o usuário temporário de staging: ${error?.message ?? "usuário ausente"}`);
  }
  authUserId = data.user.id;

  await sql`
    insert into public.app_user (id, org_id, email, nome, perfil, ativo)
    values (${authUserId}, ${process.env.DEFAULT_ORG_ID}, ${email}, 'Verificação temporária Fase A', 'admin', true)
    on conflict (id) do update set
      org_id = excluded.org_id,
      email = excluded.email,
      nome = excluded.nome,
      perfil = 'admin',
      ativo = true
  `;

  testExitCode = await runPlaywright([
      "e2e/navegacao-responsiva.spec.ts",
      "--workers=4",
      "--fully-parallel",
  ]);
  if (testExitCode === 0) {
    testExitCode = await runPlaywright([
      "e2e/auth-perfis.spec.ts",
      "e2e/core-crm.spec.ts",
      "e2e/operacao-comercial.spec.ts",
      "--project=wide-1920",
      "--workers=1",
    ]);
  }
} finally {
  await removeTemporaryUsers();
  await sql.end({ timeout: 2 });
}

if (testExitCode !== 0) {
  throw new Error(`Playwright encerrou com código ${testExitCode}.`);
}

console.log("Staging autenticado validado nos quatro breakpoints; usuário temporário removido.");
