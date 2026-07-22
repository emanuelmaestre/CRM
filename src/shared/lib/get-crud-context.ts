import { db } from "@/shared/lib/db";
import { getAuthContext } from "@/shared/lib/auth/session";
import type { CrudContext } from "@/shared/lib/crud-factory";

export async function getCrudContext(): Promise<CrudContext> {
  const contexto = await getAuthContext();

  return {
    db,
    orgId: contexto.orgId,
    userId: contexto.userId,
    perfil: contexto.perfil,
  };
}
