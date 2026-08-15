"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getCrudContext } from "@/shared/lib/get-crud-context";
import { appUser, brand, cliente, oportunidade } from "@/shared/lib/db/schema";
import { gerarDocumento } from "@/modules/documentos/application/documentos.service";
import {
  analisarGargalosFunil,
  criarEtapasPadrao,
  criarOportunidade,
  excluirOportunidade,
  listarFunil,
  listarReferenciasFunil,
  moverOportunidade,
} from "@/modules/vendas/application/funil.service";
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

export async function actionMoverOportunidade(oportunidadeId: string, novaEtapaId: string, motivoPerda?: string) {
  const ctx = await getCrudContext();
  const atualizada = await moverOportunidade(ctx, oportunidadeId, novaEtapaId, motivoPerda);
  revalidatePath("/vendas");
  return atualizada;
}

export async function actionAnalisarGargalosFunil() {
  const ctx = await getCrudContext();
  return analisarGargalosFunil(ctx);
}

export async function actionGerarPropostaOportunidade(oportunidadeId: string) {
  const ctx = await getCrudContext();

  const op = await ctx.db
    .select({
      titulo: oportunidade.titulo,
      valor: oportunidade.valor,
      clienteNome: cliente.nome,
      marcaNome: brand.name,
      responsavelNome: appUser.nome,
    })
    .from(oportunidade)
    .leftJoin(cliente, eq(cliente.id, oportunidade.clienteId))
    .innerJoin(brand, eq(brand.id, oportunidade.brandId))
    .leftJoin(appUser, eq(appUser.id, oportunidade.responsavelId))
    .where(and(eq(oportunidade.id, oportunidadeId), eq(oportunidade.orgId, ctx.orgId)))
    .then((rows) => rows[0]);

  if (!op) throw new Error("Oportunidade não encontrada.");

  return gerarDocumento(ctx, {
    tipo: "proposta",
    periodo: new Date().toLocaleDateString("pt-BR"),
    dadosProposta: {
      titulo: op.titulo,
      clienteNome: op.clienteNome ?? "Cliente não vinculado",
      marcaNome: op.marcaNome,
      valor: op.valor != null ? Number(op.valor) : null,
      responsavelNome: op.responsavelNome,
      validadeDias: 7,
      condicoesPagamento: "A combinar com o responsável comercial",
    },
  });
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
