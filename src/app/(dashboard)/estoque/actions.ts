"use server";

import { revalidatePath } from "next/cache";
import { getCrudContext } from "@/shared/lib/get-crud-context";
import {
  editarProduto, listarProdutos, listarProdutosParados, contarIndicadoresEstoque,
  definirEstoqueMinimoEmLote, contarProdutosPorCanal, contarProdutosPorMarca,
  simularReguaEstoque, aplicarReguaEstoque, buscarProdutoDetalhe, type EstadoEstoque,
} from "@/modules/estoque/application/estoque.service";
import { importarCatalogoMercadoLivre } from "@/modules/estoque/application/importar-catalogo.service";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/shared/lib/db";
import { brand, produto, produtoCanal, channelAccount } from "@/shared/lib/db/schema";
import { assertPerfil } from "@/shared/lib/crud-factory";
import { compararPorOrdemDeMarca } from "@/shared/config/brands";

const BrandIdSchema = z.string().uuid();
const EstadoSchema = z.enum(["abaixo_minimo", "sem_estoque", "sem_minimo", "parados"]);
const CanalVendaSchema = z.enum(["mercadolivre", "shopee", "tiktokshop"]);

export async function actionListarProdutos(opts: {
  brandIds?: string[];
  busca?: string;
  estado?: string;
  canalTipos?: string[];
  offset?: number;
} = {}) {
  const ctx = await getCrudContext();
  const brandIdsValidados = opts.brandIds?.length ? z.array(BrandIdSchema).parse(opts.brandIds) : undefined;
  const estado = opts.estado ? EstadoSchema.parse(opts.estado) : undefined;
  const canalTiposValidados = opts.canalTipos?.length ? z.array(CanalVendaSchema).parse(opts.canalTipos) : undefined;
  const offset = Math.max(0, Math.trunc(opts.offset ?? 0));

  // "Parados" não é uma condição SQL sobre saldo: depende do cálculo de risco
  // de encalhe (dias sem venda × capital parado). Resolvemos os IDs primeiro e
  // passamos como filtro, para a lista continuar com uma consulta só.
  const idsParados = estado === "parados"
    ? await listarProdutosParados(ctx).then((itens) => itens.map((item) => item.id))
    : undefined;

  const result = await listarProdutos(ctx, {
    brandIds: brandIdsValidados,
    busca: opts.busca?.trim(),
    estado: estado === "parados" ? undefined : (estado as EstadoEstoque | undefined),
    canalTipos: canalTiposValidados,
    ids: idsParados,
    limit: 50,
    offset,
  });
  const permissions = { canManage: ctx.perfil === "admin" || ctx.perfil === "gestor" };
  return { ...result, permissions };
}

export async function actionIndicadoresEstoque(brandIds?: string[], canalTipos?: string[]) {
  const ctx = await getCrudContext();
  const brandIdsValidados = brandIds?.length ? z.array(BrandIdSchema).parse(brandIds) : undefined;
  const canalTiposValidados = canalTipos?.length ? z.array(CanalVendaSchema).parse(canalTipos) : undefined;
  const [contagens, parados] = await Promise.all([
    contarIndicadoresEstoque(ctx, { brandIds: brandIdsValidados, canalTipos: canalTiposValidados }),
    listarProdutosParados(ctx),
  ]);

  return {
    ...contagens,
    parados: parados.length,
    capitalParado: parados.reduce((soma, item) => soma + item.capitalParado, 0),
  };
}

export async function actionContarProdutosPorCanal(brandIds?: string[]) {
  const ctx = await getCrudContext();
  const brandIdsValidados = brandIds?.length ? z.array(BrandIdSchema).parse(brandIds) : undefined;
  return contarProdutosPorCanal(ctx, { brandIds: brandIdsValidados });
}

export async function actionContarProdutosPorMarca(canalTipos?: string[]) {
  const ctx = await getCrudContext();
  const canalTiposValidados = canalTipos?.length ? z.array(CanalVendaSchema).parse(canalTipos) : undefined;
  return contarProdutosPorMarca(ctx, { canalTipos: canalTiposValidados });
}

export async function actionDefinirEstoqueMinimoEmLote(produtoIds: string[], estoqueMinimo: number) {
  const ctx = await getCrudContext();
  const ids = z.array(z.string().uuid()).min(1).max(500).parse(produtoIds);
  const minimo = z.number().int().min(0).max(1_000_000).parse(estoqueMinimo);
  const result = await definirEstoqueMinimoEmLote(ctx, ids, minimo);
  revalidatePath("/estoque");
  return result;
}

/* ── Régua de alertas (wizard /estoque/alertas) ──────────────────────────── */

const EscopoReguaSchema = z.object({
  brandId: BrandIdSchema.optional(),
  canalTipo: CanalVendaSchema.optional(),
  somenteSemMinimo: z.boolean().optional(),
});

// O mínimo tem o mesmo teto do lote manual — o que entra pela régua não pode
// gravar valores que a edição campo a campo recusaria.
const MinimoSchema = z.number().int().min(0).max(1_000_000);

const ReguaSchema = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("fixo"), minimo: MinimoSchema }),
  z.object({
    tipo: z.literal("giro"),
    faixas: z.array(z.object({
      vendaMensalMinima: z.number().int().min(0).max(1_000_000),
      minimo: MinimoSchema,
    })).min(1).max(10),
  }),
]);

export async function actionSimularReguaEstoque(escopo: unknown, regua: unknown) {
  const ctx = await getCrudContext();
  return simularReguaEstoque(ctx, EscopoReguaSchema.parse(escopo), ReguaSchema.parse(regua));
}

export async function actionAplicarReguaEstoque(escopo: unknown, regua: unknown, excluirIds: string[] = []) {
  const ctx = await getCrudContext();
  const result = await aplicarReguaEstoque(
    ctx,
    EscopoReguaSchema.parse(escopo),
    ReguaSchema.parse(regua),
    z.array(z.string().uuid()).max(1000).parse(excluirIds),
  );
  revalidatePath("/estoque");
  return result;
}

export async function actionImportarCatalogoEstoque() {
  const ctx = await getCrudContext();
  const result = await importarCatalogoMercadoLivre(ctx);
  revalidatePath("/estoque");
  return result;
}

export async function actionListarProdutosParados() {
  const ctx = await getCrudContext();
  return listarProdutosParados(ctx);
}

export async function actionListarMarcasEstoque() {
  const ctx = await getCrudContext();
  const marcas = await db.select({ id: brand.id, name: brand.name, slug: brand.slug }).from(brand).where(and(
    eq(brand.orgId, ctx.orgId),
    eq(brand.active, true),
  ));
  return marcas.sort(compararPorOrdemDeMarca);
}

const MapeamentoCanalSchema = z.object({
  produtoId: z.string().uuid(),
  channelAccountId: z.string().uuid(),
  externalListingId: z.string().trim().min(1).max(200),
  externalSkuId: z.string().trim().max(200).optional(),
  externalWarehouseId: z.string().trim().max(200).optional(),
});

export async function actionListarContasCanal() {
  const ctx = await getCrudContext();
  assertPerfil(ctx, ["admin", "gestor"]);
  return db
    .select({ id: channelAccount.id, tipo: channelAccount.tipo, nome: channelAccount.nome, status: channelAccount.status, brandId: channelAccount.brandId })
    .from(channelAccount)
    .where(eq(channelAccount.orgId, ctx.orgId));
}

export async function actionListarMapeamentosCanal(produtoId: string) {
  const ctx = await getCrudContext();
  assertPerfil(ctx, ["admin", "gestor"]);
  const id = z.string().uuid().parse(produtoId);
  const produtoValido = await db.select({ id: produto.id }).from(produto).where(and(
    eq(produto.id, id), eq(produto.orgId, ctx.orgId),
  )).then((rows) => rows[0]);
  if (!produtoValido) throw new Error("Produto não encontrado.");
  return db
    .select({
      id: produtoCanal.id,
      channelAccountId: produtoCanal.channelAccountId,
      externalListingId: produtoCanal.externalListingId,
      externalSkuId: produtoCanal.externalSkuId,
      externalWarehouseId: produtoCanal.externalWarehouseId,
      ativo: produtoCanal.ativo,
      contaTipo: channelAccount.tipo,
      contaNome: channelAccount.nome,
    })
    .from(produtoCanal)
    .innerJoin(channelAccount, eq(channelAccount.id, produtoCanal.channelAccountId))
    .where(and(eq(produtoCanal.orgId, ctx.orgId), eq(produtoCanal.produtoId, id)));
}

export async function actionSalvarMapeamentoCanal(
  produtoId: string,
  channelAccountId: string,
  externalListingId: string,
  externalSkuId?: string,
  externalWarehouseId?: string,
) {
  const ctx = await getCrudContext();
  assertPerfil(ctx, ["admin", "gestor"]);
  const input = MapeamentoCanalSchema.parse({
    produtoId,
    channelAccountId,
    externalListingId,
    externalSkuId: externalSkuId?.trim() || undefined,
    externalWarehouseId: externalWarehouseId?.trim() || undefined,
  });

  const [produtoValido, contaValida] = await Promise.all([
    db.select({ id: produto.id, brandId: produto.brandId }).from(produto).where(and(
      eq(produto.id, input.produtoId), eq(produto.orgId, ctx.orgId),
    )).then((rows) => rows[0]),
    db.select({ id: channelAccount.id, brandId: channelAccount.brandId }).from(channelAccount).where(and(
      eq(channelAccount.id, input.channelAccountId), eq(channelAccount.orgId, ctx.orgId),
    )).then((rows) => rows[0]),
  ]);
  if (!produtoValido || !contaValida || produtoValido.brandId !== contaValida.brandId) {
    throw new Error("Produto e canal devem pertencer à mesma marca da organização.");
  }

  await db
    .insert(produtoCanal)
    .values({ orgId: ctx.orgId, ...input, ativo: true })
    .onConflictDoUpdate({
      target: [produtoCanal.produtoId, produtoCanal.channelAccountId],
      set: {
        externalListingId: input.externalListingId,
        externalSkuId: input.externalSkuId,
        externalWarehouseId: input.externalWarehouseId,
        ativo: true,
        updatedAt: new Date(),
      },
    });

  revalidatePath("/estoque");
}

export async function actionRemoverMapeamentoCanal(mapeamentoId: string) {
  const ctx = await getCrudContext();
  assertPerfil(ctx, ["admin", "gestor"]);
  z.string().uuid().parse(mapeamentoId);
  await db
    .update(produtoCanal)
    .set({ ativo: false, updatedAt: new Date() })
    .where(and(eq(produtoCanal.id, mapeamentoId), eq(produtoCanal.orgId, ctx.orgId)));
  revalidatePath("/estoque");
}

export async function actionEditarProduto(
  produtoId: string,
  nome: string,
  preco: string,
) {
  const ctx = await getCrudContext();
  const id = z.string().uuid().parse(produtoId);
  const result = await editarProduto(ctx, id, { nome, preco });
  revalidatePath("/estoque");
  return result;
}

export async function actionBuscarProdutoDetalhe(produtoId: string) {
  const ctx = await getCrudContext();
  const id = z.string().uuid().parse(produtoId);
  return buscarProdutoDetalhe(ctx, id);
}

