"use server";

import { revalidatePath } from "next/cache";
import { getCrudContext } from "@/shared/lib/get-crud-context";
import {
  criarProduto, editarProduto, listarProdutos, listarProdutosParados, registrarMovimento,
  listarDivergenciasEstoque, resolverDivergenciaEstoque,
} from "@/modules/estoque/application/estoque.service";
import { importarCatalogoMercadoLivre } from "@/modules/estoque/application/importar-catalogo.service";
import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/shared/lib/db";
import { brand, produto, produtoCanal, channelAccount } from "@/shared/lib/db/schema";
import { assertPerfil } from "@/shared/lib/crud-factory";

const BrandIdSchema = z.string().uuid();
const MovimentoSchema = z.object({
  produtoId: z.string().uuid(),
  tipo: z.enum(["entrada", "saida", "ajuste"]),
  quantidade: z.number().int().positive(),
  observacao: z.string().trim().max(500).optional(),
});

export async function actionCriarProduto(formData: FormData) {
  const ctx = await getCrudContext();
  const result = await criarProduto(ctx, {
    brandId: formData.get("brandId") as string,
    sku: formData.get("sku") as string,
    nome: formData.get("nome") as string,
    preco: formData.get("preco") as string,
    custo: (formData.get("custo") as string) || undefined,
    estoqueMinimo: Number(formData.get("estoqueMinimo") || 0),
    ativo: true,
  });
  revalidatePath("/estoque");
  return result;
}

export async function actionListarProdutos(brandId?: string, busca?: string) {
  const ctx = await getCrudContext();
  const brandIdValidado = brandId ? BrandIdSchema.parse(brandId) : undefined;
  const result = await listarProdutos(ctx, { brandId: brandIdValidado, busca: busca?.trim(), limit: 50 });
  const permissions = { canManage: ctx.perfil === "admin" || ctx.perfil === "gestor" };

  if (ctx.perfil !== "vendedor") return { ...result, permissions };

  return {
    ...result,
    permissions,
    data: result.data.map((produto) => {
      return Object.fromEntries(
        Object.entries(produto).filter(([field]) => field !== "custo"),
      );
    }),
  };
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
  return db.select({ id: brand.id, name: brand.name, slug: brand.slug }).from(brand).where(and(
    eq(brand.orgId, ctx.orgId),
    eq(brand.active, true),
  )).orderBy(asc(brand.name));
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
  custo?: string,
  estoqueMinimo?: number,
) {
  const ctx = await getCrudContext();
  const id = z.string().uuid().parse(produtoId);
  const result = await editarProduto(ctx, id, { nome, preco, custo: custo || undefined, estoqueMinimo });
  revalidatePath("/estoque");
  return result;
}

export async function actionListarDivergenciasEstoque() {
  const ctx = await getCrudContext();
  return listarDivergenciasEstoque(ctx);
}

export async function actionResolverDivergenciaEstoque(
  divergenciaId: string,
  decisao: "aplicar_canal" | "ignorar",
) {
  const ctx = await getCrudContext();
  const id = z.string().uuid().parse(divergenciaId);
  const decisaoValidada = z.enum(["aplicar_canal", "ignorar"]).parse(decisao);
  const result = await resolverDivergenciaEstoque(ctx, id, decisaoValidada);
  revalidatePath("/estoque");
  return result;
}

export async function actionRegistrarMovimento(
  produtoId: string,
  tipo: "entrada" | "saida" | "ajuste",
  quantidade: number,
  observacao?: string
) {
  const ctx = await getCrudContext();
  const input = MovimentoSchema.parse({ produtoId, tipo, quantidade, observacao });
  const result = await registrarMovimento(ctx, input);
  revalidatePath("/estoque");
  return result;
}
