import { createClient } from "@/shared/lib/supabase/server";
import { db } from "@/shared/lib/db";
import type { CrudContext } from "@/shared/lib/crud-factory";

const DEFAULT_ORG_ID = process.env.DEFAULT_ORG_ID!;

export async function getCrudContext(): Promise<CrudContext> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Não autenticado");

  return {
    db,
    orgId: DEFAULT_ORG_ID,
    userId: user.id,
    perfil: "admin",
  };
}
