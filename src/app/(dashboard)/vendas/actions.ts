"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCrudContext } from "@/shared/lib/get-crud-context";
import {
  cancelarPedido, contarPedidosPorCanal, contarPedidosPorMarca, listarPedidosDetalhados,
  resumirPedidos, listarPedidosDoIndicador,
} from "@/modules/vendas/application/pedidos.service";
import { IndicadorPedidosSchema, normalizarConsultaPedidos, type IndicadorPedidos } from "@/modules/vendas/domain/consulta-pedidos";

/* ── Pedidos ──────────────────────────────────────────────────────────── */

export async function actionListarPedidosDoIndicador(
  indicador: IndicadorPedidos,
  opts: Parameters<typeof actionListarPedidosDetalhados>[0] = {},
) {
  const ctx = await getCrudContext();
  return listarPedidosDoIndicador(ctx, IndicadorPedidosSchema.parse(indicador), normalizarConsultaPedidos(opts));
}

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
  const [result, resumo, marcas, canais] = await Promise.all([
    listarPedidosDetalhados(ctx, {
      ...filtros,
      limit: 50,
      offset,
    }),
    resumirPedidos(ctx, filtros),
    contarPedidosPorMarca(ctx, { canais: filtros.canais }),
    contarPedidosPorCanal(ctx, { brandIds: filtros.brandIds }),
  ]);
  return {
    ...result,
    resumo,
    marcas,
    canais,
    permissions: { canManage: ctx.perfil === "admin" || ctx.perfil === "gestor" },
  };
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

export async function actionObterFiltrosPedidos() {
  const ctx = await getCrudContext();
  const [marcas, canais] = await Promise.all([
    contarPedidosPorMarca(ctx),
    contarPedidosPorCanal(ctx),
  ]);
  return { marcas, canais };
}

export async function actionCancelarPedido(pedidoId: string, motivo: string) {
  const ctx = await getCrudContext();
  const id = z.string().uuid().parse(pedidoId);
  const result = await cancelarPedido(ctx, id, motivo);
  revalidatePath("/vendas/pedidos");
  revalidatePath(`/vendas/pedidos/${id}`);
  return result;
}
