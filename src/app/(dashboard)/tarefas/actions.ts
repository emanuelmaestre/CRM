"use server";

import { revalidatePath } from "next/cache";
import { getCrudContext } from "@/shared/lib/get-crud-context";
import {
  atualizarStatusTarefa,
  criarTarefa,
  listarLembretes,
  listarReferenciasOperacao,
  listarTarefas,
} from "@/modules/vendas/application/operacao.service";
import type { FiltrosTarefaDTO } from "@/modules/vendas/domain/operacao";

export async function actionListarTarefas(filtros: FiltrosTarefaDTO = {}) {
  const ctx = await getCrudContext();
  return {
    data: await listarTarefas(ctx, filtros),
    permissions: { canViewTeam: ctx.perfil !== "vendedor" },
  };
}

export async function actionListarLembretes(janelaHoras?: number) {
  const ctx = await getCrudContext();
  return listarLembretes(ctx, { janelaHoras });
}

export async function actionListarReferenciasTarefa() {
  const ctx = await getCrudContext();
  return listarReferenciasOperacao(ctx);
}

export async function actionCriarTarefa(formData: FormData) {
  const ctx = await getCrudContext();
  const criada = await criarTarefa(ctx, {
    titulo: String(formData.get("titulo") ?? ""),
    descricao: String(formData.get("descricao") ?? ""),
    clienteId: String(formData.get("clienteId") ?? ""),
    responsavelId: String(formData.get("responsavelId") ?? ""),
    vencimentoEm: String(formData.get("vencimentoEm") ?? ""),
  });
  revalidatePath("/tarefas");
  revalidatePath("/clientes/[id]", "page");
  return criada;
}

export async function actionAtualizarStatusTarefa(tarefaId: string, status: string) {
  const ctx = await getCrudContext();
  const atualizada = await atualizarStatusTarefa(ctx, tarefaId, status);
  revalidatePath("/tarefas");
  revalidatePath("/clientes/[id]", "page");
  return atualizada;
}
