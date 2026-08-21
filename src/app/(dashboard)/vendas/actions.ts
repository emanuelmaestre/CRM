"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCrudContext } from "@/shared/lib/get-crud-context";
import {
  cancelarPedido, contarPedidosPorCanal, contarPedidosPorMarca, listarPedidosDetalhados, resumirPedidos,
} from "@/modules/vendas/application/pedidos.service";
import { normalizarConsultaPedidos } from "@/modules/vendas/domain/consulta-pedidos";

/* ── Pedidos ──────────────────────────────────────────────────────────── */

export async function actionListarPedidosDetalhados(opts: {
  brandIds?: string[];
  canais?: string[];
  statuses?: string[];
  busca?: string;
  inicio?: string;
  fim?: string;
  offset?: number;
} = {}) {
  const ctx = await getCrudContext();
  const { offset, ...filtros } = normalizarConsultaPedidos(opts);
  const [result, resumo] = await Promise.all([
    listarPedidosDetalhados(ctx, {
      ...filtros,
      limit: 50,
      offset,
    }),
    resumirPedidos(ctx, filtros),
  ]);
  return { ...result, resumo, permissions: { canManage: ctx.perfil === "admin" || ctx.perfil === "gestor" } };
}

export async function actionListarPedidosParaPdf(opts: {
  brandIds?: string[];
  canais?: string[];
  statuses?: string[];
  busca?: string;
  inicio?: string;
  fim?: string;
} = {}) {
  const ctx = await getCrudContext();
  const filtros = normalizarConsultaPedidos(opts);
  const [result, resumo] = await Promise.all([
    listarPedidosDetalhados(ctx, { ...filtros, limit: 5000, offset: 0 }),
    resumirPedidos(ctx, filtros),
  ]);
  return { ...result, resumo };
}

export async function actionContarPedidosPorMarca(canais?: string[]) {
  const ctx = await getCrudContext();
  const { canais: canaisValidados } = normalizarConsultaPedidos({ canais });
  return contarPedidosPorMarca(ctx, { canais: canaisValidados });
}

export async function actionContarPedidosPorCanal(brandIds?: string[]) {
  const ctx = await getCrudContext();
  const { brandIds: marcasValidadas } = normalizarConsultaPedidos({ brandIds });
  return contarPedidosPorCanal(ctx, { brandIds: marcasValidadas });
}

export async function actionCancelarPedido(pedidoId: string, motivo: string) {
  const ctx = await getCrudContext();
  const id = z.string().uuid().parse(pedidoId);
  const result = await cancelarPedido(ctx, id, motivo);
  revalidatePath("/vendas/pedidos");
  revalidatePath(`/vendas/pedidos/${id}`);
  return result;
}
