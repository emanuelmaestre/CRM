"use server";

import { revalidatePath } from "next/cache";
import { getCrudContext } from "@/shared/lib/get-crud-context";
import { atualizarUsuario, listarUsuarios } from "@/modules/usuarios/application/usuarios.service";
import {
  atualizarContaCanalConfiguracao,
  criarContaCanalConfiguracao,
  listarConfiguracaoCanais,
  removerContaCanalConfiguracao,
  salvarMapeamentoCanalConfiguracao,
} from "@/modules/canais/application/configuracao-canais.service";
import { listarProdutos } from "@/modules/estoque/application/estoque.service";

export async function actionListarUsuarios() {
  return listarUsuarios(await getCrudContext());
}

export async function actionAtualizarUsuario(input: unknown) {
  const resultado = await atualizarUsuario(await getCrudContext(), input);
  revalidatePath("/configuracoes");
  return resultado;
}

export async function actionListarConfiguracaoCanais() {
  return listarConfiguracaoCanais(await getCrudContext());
}

export async function actionListarProdutosConfiguracao() {
  const ctx = await getCrudContext();
  const result = await listarProdutos(ctx, { limit: 500 });
  return result.data.map((item) => ({
    id: item.id,
    brandId: item.brandId,
    sku: item.sku,
    nome: item.nome,
  }));
}

export async function actionCriarContaCanal(input: unknown) {
  const result = await criarContaCanalConfiguracao(await getCrudContext(), input);
  revalidatePath("/configuracoes");
  revalidatePath("/admin/saude");
  return result;
}

export async function actionAtualizarContaCanal(input: unknown) {
  const result = await atualizarContaCanalConfiguracao(await getCrudContext(), input);
  revalidatePath("/configuracoes");
  revalidatePath("/admin/saude");
  return result;
}

export async function actionRemoverContaCanal(input: unknown) {
  const result = await removerContaCanalConfiguracao(await getCrudContext(), input);
  revalidatePath("/configuracoes");
  revalidatePath("/admin/saude");
  revalidatePath("/estoque");
  return result;
}

export async function actionSalvarMapeamentoCanal(input: unknown) {
  await salvarMapeamentoCanalConfiguracao(await getCrudContext(), input);
  revalidatePath("/configuracoes");
  revalidatePath("/estoque");
}
