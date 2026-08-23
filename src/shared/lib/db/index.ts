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

// app.current_org_id não vai mais na connection string. Foi confirmado que
// esse GUC não tinha nenhum efeito na conexão da app: o role "postgres" do
// Supabase tem rolbypassrls=true, então as policies de RLS que o liam nunca
// eram avaliadas para essa conexão (ver memória "RLS decorativo"). Setar via
// ALTER ROLE/DATABASE (a alternativa cogitada para preservar o GUC sem
// prender o pooler em session mode) também não é permitido — o "postgres"
// do Supabase não é superuser de verdade. Como o valor era inerte, a
// correção é não tentar setá-lo: isso libera usar o pooler em transaction
// mode e subir `max` (ver getDatabaseClientOptions). A validação do UUID
// continua aqui para pegar cedo o placeholder do .env.example.
export function buildTenantConnectionString(connectionString: string, orgId: string): string {
  if (!UUID_PATTERN.test(orgId)) {
    throw new Error(
      "DEFAULT_ORG_ID deve ser o UUID de uma org existente, não o placeholder do .env.example.",
    );
  }

  const url = new URL(resolveDatabaseConnectionString(connectionString));
  url.searchParams.set("application_name", "crm-leo");
  return url.toString();
}

export function getDatabaseClientOptions() {
  return {
    prepare: false,
    // app.current_org_id não é mais setado na conexão (era inerte, ver
    // buildTenantConnectionString) — isso libera usar o pooler do Supabase
    // em transaction mode (porta 6543, conexões multiplexadas), então `max`
    // pode subir sem multiplicar conexões reais por instância serverless
    // como acontecia em session mode.
    max: 10,
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
