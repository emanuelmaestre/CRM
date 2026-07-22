import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";

const requiredVariables = [
  "DATABASE_URL",
  "DEFAULT_ORG_ID",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_BRAND_ID_KARZI",
  "NEXT_PUBLIC_BRAND_ID_WUWU",
  "E2E_USER_EMAIL",
  "E2E_USER_PASSWORD",
];

for (const variable of requiredVariables) {
  if (!process.env[variable]) {
    throw new Error(`${variable} não configurada para o seed E2E do CI.`);
  }
}

const databaseUrl = new URL(process.env.DATABASE_URL);
if (!new Set(["localhost", "127.0.0.1"]).has(databaseUrl.hostname)) {
  throw new Error("O seed E2E só pode executar em um PostgreSQL local e efêmero.");
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

const { data, error } = await supabase.auth.signInWithPassword({
  email: process.env.E2E_USER_EMAIL,
  password: process.env.E2E_USER_PASSWORD,
});

if (error || !data.user) {
  throw new Error(`Falha ao autenticar usuário E2E: ${error?.message ?? "usuário ausente"}`);
}

const sql = postgres(databaseUrl.toString(), { max: 1, prepare: false });
const orgId = process.env.DEFAULT_ORG_ID;
const email = process.env.E2E_USER_EMAIL;

try {
  await sql.begin(async (tx) => {
    await tx`
      insert into public.org (id, name, cnpj, active)
      values (${orgId}, 'CRM CI', 'ci-000000000001', true)
      on conflict (id) do update set active = true
    `;

    await tx`
      insert into public.brand (id, org_id, name, slug, active)
      values
        (${process.env.NEXT_PUBLIC_BRAND_ID_KARZI}, ${orgId}, 'KARZI', 'karzi', true),
        (${process.env.NEXT_PUBLIC_BRAND_ID_WUWU}, ${orgId}, 'WUWU', 'wuwu', true)
      on conflict (id) do update set org_id = excluded.org_id, active = true
    `;

    await tx`
      insert into public.app_user (id, org_id, email, nome, perfil, ativo)
      values (${data.user.id}, ${orgId}, ${email}, 'Usuário E2E CI', 'admin', 'true')
      on conflict (id) do update set
        org_id = excluded.org_id,
        email = excluded.email,
        perfil = 'admin',
        ativo = 'true'
    `;
  });

  console.log("Organização, marcas e usuário E2E semeados no banco efêmero.");
} finally {
  await sql.end({ timeout: 2 });
  await supabase.auth.signOut();
}
