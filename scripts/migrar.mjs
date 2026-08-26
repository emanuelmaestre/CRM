/**
 * Aplicador de migrations do projeto.
 *
 * Substitui `drizzle-kit migrate` por dois motivos concretos, os dois já
 * custaram tempo aqui:
 *
 * 1. O drizzle-kit sai com código 1 e NENHUMA mensagem quando algo falha
 *    contra este Supabase — o sintoma é "rodei o migrate e nada aconteceu".
 *    Aqui o erro do Postgres aparece inteiro (código, tabela, detalhe).
 * 2. O drizzle.config aponta pro pooler em transaction mode (6543), que é o
 *    certo pra aplicação mas não pra migrar. Este script força a porta de
 *    sessão (5432) do mesmo pooler.
 *
 * Ao final confere o ledger contra o journal e avisa se divergirem — a
 * divergência silenciosa entre os dois é o que faz uma migration "sumir".
 */
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { resolveDatabaseConnectionString } from "./database-url.mjs";

const PASTA = "./supabase/migrations";

if (!process.env.DATABASE_URL) {
  try { process.loadEnvFile(".env.local"); } catch { /* CI passa no ambiente */ }
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL não encontrada — defina no ambiente ou em .env.local.");
  process.exit(1);
}

/** Mesma resolução de pooler da aplicação, mas na porta de sessão. */
function urlDeMigracao() {
  const url = new URL(resolveDatabaseConnectionString(process.env.DATABASE_URL));
  if (url.hostname.includes("pooler.supabase.com")) url.port = "5432";
  return url.toString();
}

const sql = postgres(urlDeMigracao(), { max: 1, prepare: false, connect_timeout: 30 });

try {
  const journal = JSON.parse(readFileSync(`${PASTA}/meta/_journal.json`, "utf8"));
  await migrate(drizzle(sql), { migrationsFolder: PASTA });

  const [{ n }] = await sql`select count(*)::int as n from drizzle.__drizzle_migrations`;
  console.log(`migrations aplicadas: ${n} · journal: ${journal.entries.length} entradas`);
  if (n < journal.entries.length - 1) {
    console.warn(
      `AVISO: o ledger tem ${n} registros para ${journal.entries.length} entradas no journal.`
      + " Confira se alguma migration foi aplicada à mão sem entrar no ledger.",
    );
  }
  console.log(`última no journal: ${journal.entries.at(-1)?.tag}`);
} catch (erro) {
  console.error("\nFALHA AO MIGRAR");
  console.error(erro.message);
  for (const campo of ["code", "detail", "hint", "table_name", "constraint_name", "where"]) {
    if (erro[campo]) console.error(`  ${campo}: ${erro[campo]}`);
  }
  if (erro.cause) console.error("  causa:", erro.cause.message ?? erro.cause);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 10 });
}
