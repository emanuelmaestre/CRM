import { defineConfig } from "drizzle-kit";
import databaseConfig from "./src/config/database.json";

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
