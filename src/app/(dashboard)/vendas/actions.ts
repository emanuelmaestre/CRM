"use server";

import { revalidatePath } from "next/cache";
import { getCrudContext } from "@/shared/lib/get-crud-context";
import {
  criarEtapasPadrao,
  criarOportunidade,
  excluirOportunidade,
  listarFunil,
  listarReferenciasFunil,
  moverOportunidade,
} from "@/modules/vendas/application/funil.service";

export async function actionListarFunil() {
  const ctx = await getCrudContext();
  const result = await listarFunil(ctx);
  return {
    ...result,
    permissions: {
      canConfigure: ctx.perfil === "admin" || ctx.perfil === "gestor",
      canDelete: ctx.perfil === "admin" || ctx.perfil === "gestor",
    },
  };
}

export async function actionListarReferenciasFunil() {
  const ctx = await getCrudContext();
  return listarReferenciasFunil(ctx);
}

export async function actionCriarOportunidade(formData: FormData) {
  const ctx = await getCrudContext();
  const nova = await criarOportunidade(ctx, {
    titulo: formData.get("titulo") as string,
    etapaId: formData.get("etapaId") as string,
    brandId: formData.get("brandId") as string,
    clienteId: (formData.get("clienteId") as string) || "",
    responsavelId: (formData.get("responsavelId") as string) || "",
    valor: (formData.get("valor") as string) || "",
  });
  revalidatePath("/vendas");
  return nova;
}

export async function actionMoverOportunidade(oportunidadeId: string, novaEtapaId: string) {
  const ctx = await getCrudContext();
  const atualizada = await moverOportunidade(ctx, oportunidadeId, novaEtapaId);
  revalidatePath("/vendas");
  return atualizada;
}

export async function actionExcluirOportunidade(oportunidadeId: string) {
  const ctx = await getCrudContext();
  const removida = await excluirOportunidade(ctx, oportunidadeId);
  revalidatePath("/vendas");
  return removida;
}

export async function actionCriarEtapasPadrao() {
  const ctx = await getCrudContext();
  const etapas = await criarEtapasPadrao(ctx);
  revalidatePath("/vendas");
  return etapas;
}
