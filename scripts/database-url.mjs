import { readFileSync } from "node:fs";

const databaseConfig = JSON.parse(
  readFileSync(new URL("../src/config/database.json", import.meta.url), "utf8"),
);

export function resolveDatabaseConnectionString(connectionString) {
  const url = new URL(connectionString);
  const pooler = databaseConfig.supabasePoolers.find(
    ({ directHost }) => directHost === url.hostname,
  );
  if (!pooler) return connectionString;

  const projectRef = pooler.directHost.slice(3, -".supabase.co".length);
  url.hostname = pooler.poolerHost;
  url.port = String(pooler.poolerPort);
  url.username = `postgres.${projectRef}`;
  return url.toString();
}
