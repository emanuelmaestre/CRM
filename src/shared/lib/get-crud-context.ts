import { createClient } from "@/shared/lib/supabase/server";
import { db } from "@/shared/lib/db";
import { and, eq } from "drizzle-orm";
import { appUser } from "@/shared/lib/db/schema";
import type { CrudContext } from "@/shared/lib/crud-factory";
import { z } from "zod";

const UuidSchema = z.string().uuid();

function getDefaultOrgId(): string {
  return UuidSchema.parse(process.env.DEFAULT_ORG_ID);
}

export async function getCrudContext(): Promise<CrudContext> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado");

  const orgId = getDefaultOrgId();

  const usuarioBd = await db
    .select({ perfil: appUser.perfil, ativo: appUser.ativo })
    .from(appUser)
    .where(and(eq(appUser.id, user.id), eq(appUser.orgId, orgId)))
    .then((r) => r[0]);

  if (!usuarioBd) {
    throw new Error("Usuário autenticado, mas não provisionado para esta organização.");
  }
  if (usuarioBd.ativo !== "true") {
    throw new Error("Usuário desativado.");
  }

  return {
    db,
    orgId,
    userId: user.id,
    perfil: usuarioBd.perfil,
  };
}
