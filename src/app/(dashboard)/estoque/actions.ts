"use server";

import { revalidatePath } from "next/cache";
import { getCrudContext } from "@/shared/lib/get-crud-context";
import { criarProduto, listarProdutos, registrarMovimento } from "@/modules/estoque/application/estoque.service";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/shared/lib/db";
import { produtoCanal, channelAccount } from "@/shared/lib/db/schema";
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

export async function actionListarProdutos(brandId?: string) {
  const ctx = await getCrudContext();
  const brandIdValidado = brandId ? BrandIdSchema.parse(brandId) : undefined;
  const result = await listarProdutos(ctx, { brandId: brandIdValidado, limit: 50 });

  if (ctx.perfil !== "vendedor") return result;

  return {
    ...result,
    data: result.data.map((produto) => {
      const produtoSeguro = { ...produto };
      delete produtoSeguro.custo;
      return produtoSeguro;
    }),
  };
}

const MapeamentoCanalSchema = z.object({
  produtoId: z.string().uuid(),
  channelAccountId: z.string().uuid(),
  externalListingId: z.string().trim().min(1).max(200),
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
  z.string().uuid().parse(produtoId);
  return db
    .select({
      id: produtoCanal.id,
      channelAccountId: produtoCanal.channelAccountId,
      externalListingId: produtoCanal.externalListingId,
      ativo: produtoCanal.ativo,
      contaTipo: channelAccount.tipo,
      contaNome: channelAccount.nome,
    })
    .from(produtoCanal)
    .innerJoin(channelAccount, eq(channelAccount.id, produtoCanal.channelAccountId))
    .where(and(eq(produtoCanal.orgId, ctx.orgId), eq(produtoCanal.produtoId, produtoId)));
}

export async function actionSalvarMapeamentoCanal(produtoId: string, channelAccountId: string, externalListingId: string) {
  const ctx = await getCrudContext();
  assertPerfil(ctx, ["admin", "gestor"]);
  const input = MapeamentoCanalSchema.parse({ produtoId, channelAccountId, externalListingId });

  await db
    .insert(produtoCanal)
    .values({ orgId: ctx.orgId, ...input, ativo: true })
    .onConflictDoUpdate({
      target: [produtoCanal.produtoId, produtoCanal.channelAccountId],
      set: { externalListingId: input.externalListingId, ativo: true, updatedAt: new Date() },
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
