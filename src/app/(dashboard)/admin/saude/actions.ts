"use server";

import { revalidatePath } from "next/cache";
import { assertPerfil } from "@/shared/lib/crud-factory";
import { getCrudContext } from "@/shared/lib/get-crud-context";
import { verificarSaudeConectores } from "@/modules/canais/application/saude.service";

export async function actionVerificarSaudeConectores() {
  const ctx = await getCrudContext();
  assertPerfil(ctx, ["admin", "gestor"]);
  await verificarSaudeConectores(ctx.orgId);
  revalidatePath("/admin/saude");
  revalidatePath("/configuracoes");
}
