"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCrudContext } from "@/shared/lib/get-crud-context";
import {
  criarSegmento, excluirSegmento, listarClientesSegmento, listarSegmentos, listarTagsReferencia,
} from "@/modules/clientes/application/segmentos.service";

const SegmentoIdSchema = z.string().uuid();

export async function actionListarSegmentos() {
  const ctx = await getCrudContext();
  return {
    data: await listarSegmentos(ctx),
    permissions: { canManage: ctx.perfil === "admin" || ctx.perfil === "gestor" },
  };
}

export async function actionListarTagsReferencia() {
  const ctx = await getCrudContext();
  return listarTagsReferencia(ctx);
}

export async function actionCriarSegmento(nome: string, filtros: {
  tagIds?: string[]; brandIds?: string[]; canalTipos?: Array<"mercadolivre" | "shopee" | "tiktokshop">;
  totalGastoMin?: number; totalGastoMax?: number; pedidosMin?: number; diasSemComprarMin?: number;
}) {
  const ctx = await getCrudContext();
  const novo = await criarSegmento(ctx, { nome, filtros });
  revalidatePath("/clientes");
  return novo;
}

export async function actionExcluirSegmento(segmentoId: string) {
  const ctx = await getCrudContext();
  const excluido = await excluirSegmento(ctx, SegmentoIdSchema.parse(segmentoId));
  revalidatePath("/clientes");
  return excluido;
}

export async function actionListarClientesSegmento(segmentoId: string) {
  const ctx = await getCrudContext();
  return listarClientesSegmento(ctx, SegmentoIdSchema.parse(segmentoId));
}
