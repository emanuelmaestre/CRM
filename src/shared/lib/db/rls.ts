import { sql } from "drizzle-orm";
import { db } from "./index";

/**
 * Define o org_id corrente na sessão Postgres para que as policies RLS funcionem.
 * Deve ser chamado no início de cada request autenticado (ex: middleware ou layout server).
 * O parâmetro `true` no set_config torna a configuração local à transação.
 */
export async function setCurrentOrg(orgId: string): Promise<void> {
  await db.execute(sql`SELECT set_current_org(${orgId}::uuid)`);
}
