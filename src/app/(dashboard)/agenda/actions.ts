"use server";

import { revalidatePath } from "next/cache";
import { getCrudContext } from "@/shared/lib/get-crud-context";
import {
  criarEventoAgenda,
  excluirEventoAgenda,
  listarAgenda,
  listarReferenciasOperacao,
} from "@/modules/vendas/application/operacao.service";

export async function actionListarAgenda(inicio: string, fim: string, responsavelId?: string) {
  const ctx = await getCrudContext();
  return {
    data: await listarAgenda(ctx, { inicio, fim, responsavelId: responsavelId || "" }),
    permissions: { canViewTeam: ctx.perfil !== "vendedor" },
  };
}

export async function actionListarReferenciasAgenda() {
  const ctx = await getCrudContext();
  return listarReferenciasOperacao(ctx);
}

export async function actionCriarEventoAgenda(formData: FormData) {
  const ctx = await getCrudContext();
  const criado = await criarEventoAgenda(ctx, {
    titulo: String(formData.get("titulo") ?? ""),
    clienteId: String(formData.get("clienteId") ?? ""),
    responsavelId: String(formData.get("responsavelId") ?? ""),
    inicio: String(formData.get("inicio") ?? ""),
    fim: String(formData.get("fim") ?? ""),
  });
  revalidatePath("/agenda");
  return criado;
}

export async function actionExcluirEventoAgenda(eventoId: string) {
  const ctx = await getCrudContext();
  const excluido = await excluirEventoAgenda(ctx, eventoId);
  revalidatePath("/agenda");
  return excluido;
}
