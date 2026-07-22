import { sql } from "drizzle-orm";
import { db, type DB } from "./index";

export type DBTransaction = Parameters<Parameters<DB["transaction"]>[0]>[0];

/**
 * Define o org_id corrente na sessão Postgres para que as policies RLS funcionem.
 * Deve ser chamado no início de cada request autenticado (ex: middleware ou layout server).
 * O parâmetro `true` no set_config torna a configuração local à transação.
 */
export async function withCurrentOrg<T>(
  orgId: string,
  operation: (tx: DBTransaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_current_org(${orgId}::uuid)`);
    return operation(tx);
  });
}
