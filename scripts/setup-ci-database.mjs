import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
const mode = process.argv[2];

if (!databaseUrl) {
  throw new Error("DATABASE_URL não configurada para preparar o banco do CI.");
}

if (!new Set(["bootstrap", "grants"]).has(mode)) {
  throw new Error("Uso: node scripts/setup-ci-database.mjs <bootstrap|grants>");
}

const sql = postgres(databaseUrl, {
  max: 1,
  prepare: false,
  connect_timeout: 10,
});

try {
  if (mode === "bootstrap") {
    await sql.unsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
          CREATE ROLE anon NOLOGIN;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
          CREATE ROLE authenticated NOLOGIN;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
          CREATE ROLE service_role NOLOGIN BYPASSRLS;
        END IF;
      END
      $$;

      ALTER ROLE service_role BYPASSRLS;
      CREATE SCHEMA IF NOT EXISTS auth;

      CREATE OR REPLACE FUNCTION auth.role()
      RETURNS text
      LANGUAGE sql
      STABLE
      AS $$ SELECT current_user::text $$;
    `);

    console.log("Roles e funções compatíveis com Supabase preparadas.");
  }

  if (mode === "grants") {
    await sql.unsafe(`
      GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
      GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
      GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;
      GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role;
    `);

    console.log("Privilégios das roles de teste aplicados.");
  }
} finally {
  await sql.end({ timeout: 2 });
}
