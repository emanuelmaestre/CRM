"use server";

import { getCrudContext } from "@/shared/lib/get-crud-context";
import { processarImportacaoClientes } from "@/modules/importacao/application/importacao.service";

export async function previewImportacao(linhas: unknown[]) {
  const ctx = await getCrudContext();
  return processarImportacaoClientes(ctx, linhas, { preview: true });
}

export async function confirmarImportacao(linhas: unknown[]) {
  const ctx = await getCrudContext();
  return processarImportacaoClientes(ctx, linhas, { preview: false });
}
