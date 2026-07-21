"use server";

import { revalidatePath } from "next/cache";
import { getCrudContext } from "@/shared/lib/get-crud-context";
import { criarProduto, listarProdutos, registrarMovimento } from "@/modules/estoque/application/estoque.service";

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
  return listarProdutos(ctx, { brandId, limit: 50 });
}

export async function actionRegistrarMovimento(
  produtoId: string,
  tipo: "entrada" | "saida" | "ajuste",
  quantidade: number,
  observacao?: string
) {
  const ctx = await getCrudContext();
  const result = await registrarMovimento(ctx, { produtoId, tipo, quantidade, observacao });
  revalidatePath("/estoque");
  return result;
}
