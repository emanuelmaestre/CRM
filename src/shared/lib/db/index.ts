import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function buildTenantConnectionString(connectionString: string, orgId: string): string {
  if (!UUID_PATTERN.test(orgId)) {
    throw new Error("DEFAULT_ORG_ID deve ser um UUID válido.");
  }

  const url = new URL(connectionString);
  const currentOptions = url.searchParams.get("options")?.trim();
  const tenantOption = `-c app.current_org_id=${orgId}`;
  url.searchParams.set("options", currentOptions ? `${currentOptions} ${tenantOption}` : tenantOption);
  url.searchParams.set("application_name", "crm-leo");
  return url.toString();
}

export function getDatabaseClientOptions() {
  return {
    prepare: false,
    max: 1,
    idle_timeout: 10,
    connect_timeout: 10,
    max_lifetime: 60,
  } as const;
}

function createDatabase() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL não configurada para o ambiente atual.");
  }
  const orgId = process.env.DEFAULT_ORG_ID;
  if (!orgId) {
    throw new Error("DEFAULT_ORG_ID não configurada para o ambiente atual.");
  }

  const client = postgres(
    buildTenantConnectionString(connectionString, orgId),
    getDatabaseClientOptions(),
  );
  return drizzle(client, { schema });
}

export type DB = ReturnType<typeof createDatabase>;

let database: DB | null = null;

export function getDb(): DB {
  database ??= createDatabase();
  return database;
}

// Compatibilidade temporária com os módulos existentes. O proxy não abre conexão
// durante import/build; a instância real só nasce no primeiro acesso em runtime.
export const db = new Proxy({} as DB, {
  get(_target, property) {
    const instance = getDb();
    const value = Reflect.get(instance, property, instance) as unknown;
    return typeof value === "function" ? value.bind(instance) : value;
  },
});
