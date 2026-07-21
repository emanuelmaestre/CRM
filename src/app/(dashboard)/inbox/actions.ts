"use server";

import { getCrudContext } from "@/shared/lib/get-crud-context";
import { listarConversas, listarMensagens } from "@/modules/inbox/application/inbox.service";

export async function actionListarConversas(opts: { brandId?: string; status?: string } = {}) {
  const ctx = await getCrudContext();
  return listarConversas(ctx.orgId, { ...opts, limit: 60 });
}

export async function actionListarMensagens(conversaId: string) {
  const ctx = await getCrudContext();
  return listarMensagens(ctx.orgId, conversaId);
}
