import { defineConfig } from "drizzle-kit";
import databaseConfig from "./src/config/database.json";

// O drizzle-kit carrega apenas .env, enquanto o projeto guarda as credenciais
// em .env.local (o arquivo que o Next lê). Sem isto, DATABASE_URL chega vazia e
// o erro que aparece é um "Invalid URL" sem pista da causa.
if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // Ambientes de CI passam a variável direto no processo; a ausência do
    // arquivo aqui não é erro.
  }
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL não encontrada — defina no ambiente ou em .env.local.");
}

function resolveMigrationConnectionString(connectionString: string): string {
  const url = new URL(connectionString);
  const pooler = databaseConfig.supabasePoolers.find(({ directHost }) => directHost === url.hostname);
  if (!pooler) return connectionString;

  const projectRef = pooler.directHost.slice(3, -".supabase.co".length);
  url.hostname = pooler.poolerHost;
  url.port = String(pooler.poolerPort);
  url.username = `postgres.${projectRef}`;
  return url.toString();
}

export default defineConfig({
  schema: "./src/shared/lib/db/schema/index.ts",
  out: "./supabase/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: resolveMigrationConnectionString(process.env.DATABASE_URL!),
  },
});
