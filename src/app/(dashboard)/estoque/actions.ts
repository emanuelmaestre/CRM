"use server";

import { revalidatePath } from "next/cache";
import { getCrudContext } from "@/shared/lib/get-crud-context";
import { criarProduto, listarProdutos, registrarMovimento } from "@/modules/estoque/application/estoque.service";
import { z } from "zod";

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
