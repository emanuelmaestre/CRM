"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { getCrudContext } from "@/shared/lib/get-crud-context";
import { assertPerfil } from "@/shared/lib/crud-factory";
import { listarHistoricoAutomacoes } from "@/modules/reguas/application/reguas.service";
import {
  atualizarUsuario,
  criarUsuarioComSenha,
  listarUsuarios,
  redefinirSenhaUsuario,
} from "@/modules/usuarios/application/usuarios.service";
import {
  atualizarContaCanalConfiguracao,
  criarContaCanalConfiguracao,
  importarProdutoMercadoLivreConfiguracao,
  listarConfiguracaoCanais,
  obterResumoConfiguracoes,
  removerContaCanalConfiguracao,
  salvarMapeamentoCanalConfiguracao,
} from "@/modules/canais/application/configuracao-canais.service";
import { listarProdutos } from "@/modules/estoque/application/estoque.service";
import {
  confirmarLoteHistorico,
  criarLoteHistorico,
  descartarLoteHistorico,
  listarLotesHistoricos,
  marcarFalhaLoteHistorico,
  obterLoteHistorico,
} from "@/modules/importacao/application/importacao-historica.service";
import { inngest } from "@/shared/lib/inngest/client";
import { dispararSincronizacaoConta, obterUltimaSincronizacaoConta } from "@/modules/canais/application/sincronizacao.service";
import { REPUTACAO_CACHE_TAG } from "@/modules/metricas/application/reputacao.service";

export async function actionListarUsuarios() {
  return listarUsuarios(await getCrudContext());
}

export async function actionAtualizarUsuario(input: unknown) {
  const resultado = await atualizarUsuario(await getCrudContext(), input);
  revalidatePath("/configuracoes");
  return resultado;
}

export async function actionCriarUsuarioComSenha(input: unknown) {
  const resultado = await criarUsuarioComSenha(await getCrudContext(), input);
  revalidatePath("/configuracoes");
  return resultado;
}

export async function actionRedefinirSenhaUsuario(input: unknown) {
  const resultado = await redefinirSenhaUsuario(await getCrudContext(), input);
  revalidatePath("/configuracoes");
  return resultado;
}

export async function actionListarConfiguracaoCanais() {
  return listarConfiguracaoCanais(await getCrudContext());
}

export async function actionDispararSincronizacaoConta(channelAccountId: string) {
  const ctx = await getCrudContext();
  const execucao = await dispararSincronizacaoConta(ctx, channelAccountId);
  revalidateTag(`reclamacoes-${ctx.orgId}`, "max");
  revalidateTag(REPUTACAO_CACHE_TAG, "max");
  revalidatePath("/metricas");
  return execucao;
}

export async function actionObterUltimaSincronizacaoConta(channelAccountId: string) {
  return obterUltimaSincronizacaoConta(await getCrudContext(), channelAccountId);
}

export async function actionListarHistoricoAutomacoes() {
  const ctx = await getCrudContext();
  assertPerfil(ctx, ["admin", "gestor"]);
  return listarHistoricoAutomacoes(ctx.orgId);
}

export async function actionObterResumoConfiguracoes() {
  return obterResumoConfiguracoes(await getCrudContext());
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

export async function actionImportarProdutoMercadoLivre(input: unknown) {
  const result = await importarProdutoMercadoLivreConfiguracao(await getCrudContext(), input);
  revalidatePath("/configuracoes");
  revalidatePath("/estoque");
  return result;
}

export async function actionListarLotesHistoricos() {
  return listarLotesHistoricos(await getCrudContext());
}

export async function actionObterLoteHistorico(loteId: string) {
  return obterLoteHistorico(await getCrudContext(), loteId);
}

export async function actionPrepararLoteHistorico(input: unknown) {
  const result = await criarLoteHistorico(await getCrudContext(), input);
  try {
    await inngest.send({
      id: `historical-prepare-${result.loteId}`,
      name: "importacao/historica.preparar",
      data: { loteId: result.loteId },
    });
  } catch (error) {
    await marcarFalhaLoteHistorico(result.loteId, error);
    throw new Error("O lote foi criado, mas nao foi possivel iniciar a preparacao. Tente novamente.");
  }
  revalidatePath("/configuracoes");
  return result;
}

export async function actionConfirmarLoteHistorico(loteId: string) {
  const result = await confirmarLoteHistorico(await getCrudContext(), loteId);
  try {
    await inngest.send({
      id: `historical-import-${result.loteId}`,
      name: "importacao/historica.confirmar",
      data: result,
    });
  } catch (error) {
    await marcarFalhaLoteHistorico(result.loteId, error);
    throw new Error("A confirmacao foi registrada, mas o processamento nao iniciou. Tente novamente.");
  }
  revalidatePath("/configuracoes");
  return result;
}

export async function actionDescartarLoteHistorico(loteId: string) {
  const result = await descartarLoteHistorico(await getCrudContext(), loteId);
  revalidatePath("/configuracoes");
  return result;
}
