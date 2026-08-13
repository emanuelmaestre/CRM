import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import databaseConfig from "@/config/database.json";
import * as schema from "./schema";

// RFC 4122 estrito de propósito: rejeita o placeholder 00000000-…-000000000000
// do .env.example, que não corresponde a nenhuma org real e deixaria o app subir
// apontando para um tenant inexistente.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function resolveDatabaseConnectionString(connectionString: string): string {
  const url = new URL(connectionString);
  const pooler = databaseConfig.supabasePoolers.find(
    ({ directHost }) => directHost === url.hostname,
  );

  if (!pooler) {
    return connectionString;
  }

  const projectRef = pooler.directHost.slice(3, -".supabase.co".length);
  url.hostname = pooler.poolerHost;
  url.port = String(pooler.poolerPort);
  url.username = `postgres.${projectRef}`;
  return url.toString();
}

export function buildTenantConnectionString(connectionString: string, orgId: string): string {
  if (!UUID_PATTERN.test(orgId)) {
    throw new Error(
      "DEFAULT_ORG_ID deve ser o UUID de uma org existente, não o placeholder do .env.example.",
    );
  }

  const url = new URL(resolveDatabaseConnectionString(connectionString));
  const currentOptions = url.searchParams.get("options")?.trim();
  const tenantOption = `-c app.current_org_id=${orgId}`;
  url.searchParams.set("options", currentOptions ? `${currentOptions} ${tenantOption}` : tenantOption);
  url.searchParams.set("application_name", "crm-leo");
  return url.toString();
}

export function getDatabaseClientOptions() {
  return {
    prepare: false,
    // O RLS lê app.current_org_id de um parâmetro de conexão (ver
    // buildTenantConnectionString), o que obriga o pooler em session mode.
    // Nesse modo cada conexão aqui segura uma conexão real do Postgres, e o
    // total é multiplicado por instância serverless — subir `max` é o caminho
    // curto para esgotar o banco. Fica em 1 de propósito; para ganhar
    // paralelismo é preciso antes mover o GUC para dentro da transação
    // (set_config(..., true)) e migrar para transaction mode.
    max: 1,
    idle_timeout: 10,
    connect_timeout: 10,
    // Conexão ociosa já é fechada por idle_timeout. O teto de 60s só derrubava
    // conexões em uso ativo, forçando novo handshake TLS no meio de uma rajada
    // de navegação. 30 min corta essa reconexão sem segurar nada parado.
    max_lifetime: 60 * 30,
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
