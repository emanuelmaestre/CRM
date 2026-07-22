"use server";

import { getCrudContext } from "@/shared/lib/get-crud-context";
import { listarAuditoria } from "@/modules/auditoria/application/auditoria.service";
import type { FiltrosAuditoriaDTO } from "@/modules/auditoria/domain/filtros";

export async function actionListarAuditoria(filtros: FiltrosAuditoriaDTO = {}) {
  const ctx = await getCrudContext();
  return listarAuditoria(ctx, filtros);
}
