"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCrudContext } from "@/shared/lib/get-crud-context";
import {
  cancelarPedido, contarPedidosPorCanal, contarPedidosPorMarca, listarPedidosDetalhados, resumirPedidos,
} from "@/modules/vendas/application/pedidos.service";
import type { PedidoStatus } from "@/modules/vendas/domain/state-machine";

const BrandIdSchema = z.string().uuid();
const CanalVendaSchema = z.enum(["mercadolivre", "shopee", "tiktokshop"]);
const PedidoStatusSchema = z.enum([
  "criado", "pago", "separado", "enviado", "entregue",
  "avaliacao_solicitada", "concluido", "cancelado", "devolvido",
]);

/* ── Pedidos ──────────────────────────────────────────────────────────── */

export async function actionListarPedidosDetalhados(opts: {
  brandIds?: string[];
  canal?: string;
  status?: string;
  busca?: string;
  inicio?: string;
  fim?: string;
  offset?: number;
} = {}) {
  const ctx = await getCrudContext();
  const filtros = {
    brandIds: opts.brandIds?.length ? z.array(BrandIdSchema).parse(opts.brandIds) : undefined,
    canal: opts.canal ? CanalVendaSchema.parse(opts.canal) : undefined,
    status: opts.status ? (PedidoStatusSchema.parse(opts.status) as PedidoStatus) : undefined,
    busca: z.string().trim().max(100).optional().parse(opts.busca || undefined),
    inicio: opts.inicio ? z.coerce.date().parse(opts.inicio) : undefined,
    fim: opts.fim ? z.coerce.date().parse(opts.fim) : undefined,
  };
  const [result, resumo] = await Promise.all([
    listarPedidosDetalhados(ctx, {
      ...filtros,
      limit: 50,
      offset: Math.max(0, Math.trunc(opts.offset ?? 0)),
    }),
    resumirPedidos(ctx, filtros),
  ]);
  return { ...result, resumo, permissions: { canManage: ctx.perfil === "admin" || ctx.perfil === "gestor" } };
}

export async function actionListarPedidosParaPdf(opts: {
  brandIds?: string[];
  canal?: string;
  status?: string;
  busca?: string;
  inicio?: string;
  fim?: string;
} = {}) {
  const ctx = await getCrudContext();
  const filtros = {
    brandIds: opts.brandIds?.length ? z.array(BrandIdSchema).parse(opts.brandIds) : undefined,
    canal: opts.canal ? CanalVendaSchema.parse(opts.canal) : undefined,
    status: opts.status ? (PedidoStatusSchema.parse(opts.status) as PedidoStatus) : undefined,
    busca: z.string().trim().max(100).optional().parse(opts.busca || undefined),
    inicio: opts.inicio ? z.coerce.date().parse(opts.inicio) : undefined,
    fim: opts.fim ? z.coerce.date().parse(opts.fim) : undefined,
  };
  const [result, resumo] = await Promise.all([
    listarPedidosDetalhados(ctx, { ...filtros, limit: 5000, offset: 0 }),
    resumirPedidos(ctx, filtros),
  ]);
  return { ...result, resumo };
}

export async function actionContarPedidosPorMarca(canal?: string) {
  const ctx = await getCrudContext();
  return contarPedidosPorMarca(ctx, { canal: canal ? CanalVendaSchema.parse(canal) : undefined });
}

export async function actionContarPedidosPorCanal(brandIds?: string[]) {
  const ctx = await getCrudContext();
  return contarPedidosPorCanal(ctx, { brandIds: brandIds?.length ? z.array(BrandIdSchema).parse(brandIds) : undefined });
}

export async function actionCancelarPedido(pedidoId: string, motivo: string) {
  const ctx = await getCrudContext();
  const id = z.string().uuid().parse(pedidoId);
  const result = await cancelarPedido(ctx, id, motivo);
  revalidatePath("/vendas/pedidos");
  revalidatePath(`/vendas/pedidos/${id}`);
  return result;
}
