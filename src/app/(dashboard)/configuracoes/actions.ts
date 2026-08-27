"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { getCrudContext } from "@/shared/lib/get-crud-context";
import { assertPerfil } from "@/shared/lib/crud-factory";
import { listarHistoricoAutomacoes } from "@/modules/reguas/application/reguas.service";
import {
  atualizarModulosUsuario,
  atualizarUsuario,
  criarUsuarioComSenha,
  excluirUsuario,
  listarUsuarios,
  redefinirSenhaUsuario,
  renomearUsuario,
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
import { obterUsoApiShopee } from "@/modules/canais/application/shopee-uso.service";
import {
  encerrarRelacaoCanal,
  listarCanaisEncerramento,
  reabrirRelacaoCanal,
} from "@/modules/canais/application/encerramento-canal.service";
import {
  autorizarExclusaoCanal,
  estadoAutorizacaoExclusao,
  executarExclusaoCanal,
} from "@/modules/canais/application/autorizacao-exclusao.service";
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
import { whatsappAlertaConfigurado } from "@/shared/lib/whatsapp/notificacoes-admin";
import { dispararSincronizacaoConta, obterUltimaSincronizacaoConta } from "@/modules/canais/application/sincronizacao.service";
import { REPUTACAO_CACHE_TAG } from "@/modules/metricas/application/reputacao.service";
import { PUBLICACOES_CACHE_TAG } from "@/modules/metricas/application/publicacoes.service";
import { listarRotinasAgendadas } from "@/modules/jobs/application/rotinas-agendadas.service";
import {
  baixarBackup,
  exportarTabelaBackup,
  finalizarBackup,
  iniciarBackup,
  listarBackups,
} from "@/modules/backups/application/backups.service";

export async function actionListarUsuarios() {
  return listarUsuarios(await getCrudContext());
}

export async function actionAtualizarUsuario(input: unknown) {
  const resultado = await atualizarUsuario(await getCrudContext(), input);
  revalidatePath("/configuracoes");
  return resultado;
}

export async function actionAtualizarModulosUsuario(input: unknown) {
  const resultado = await atualizarModulosUsuario(await getCrudContext(), input);
  revalidatePath("/configuracoes");
  return resultado;
}

export async function actionRenomearUsuario(input: unknown) {
  const resultado = await renomearUsuario(await getCrudContext(), input);
  revalidatePath("/configuracoes");
  return resultado;
}

export async function actionCriarUsuarioComSenha(input: unknown) {
  const resultado = await criarUsuarioComSenha(await getCrudContext(), input);
  revalidatePath("/configuracoes");
  return resultado;
}

export async function actionExcluirUsuario(input: unknown) {
  const resultado = await excluirUsuario(await getCrudContext(), input);
  revalidatePath("/configuracoes");
  return resultado;
}

// Sem CrudContext: é só ler três variáveis de ambiente. Fica no servidor
// porque a checagem lê process.env — nada disso pode ir pro bundle do
// cliente, então o card de Automações consulta por aqui em vez de importar
// o módulo de notificação direto.
export async function actionStatusAutomacoesWhatsApp(): Promise<{ ativo: boolean }> {
  return { ativo: whatsappAlertaConfigurado() };
}

export async function actionIniciarBackup() {
  return iniciarBackup(await getCrudContext());
}

export async function actionExportarTabelaBackup(input: unknown) {
  return exportarTabelaBackup(await getCrudContext(), input);
}

export async function actionFinalizarBackup(backupId: unknown) {
  try {
    const resultado = await finalizarBackup(await getCrudContext(), backupId);
    revalidatePath("/configuracoes");
    return { ok: true as const, backup: resultado };
  } catch (error) {
    revalidatePath("/configuracoes");
    return {
      ok: false as const,
      erro: error instanceof Error ? error.message : "Não foi possível gerar a cópia de segurança.",
    };
  }
}

export async function actionListarBackups() {
  return listarBackups(await getCrudContext());
}

/* Encerramento de relação e exclusão dos dados de um canal. São quatro ações
   separadas de propósito: encerrar, assinar, executar e reabrir. Nenhuma
   delas faz a seguinte, e a exclusão só corre depois de três admins distintos
   terem assinado com a própria senha — ver autorizacao-exclusao.service.ts. */

export async function actionListarCanaisEncerramento() {
  return listarCanaisEncerramento(await getCrudContext());
}

export async function actionEncerrarRelacaoCanal(channelAccountId: string) {
  const resultado = await encerrarRelacaoCanal(await getCrudContext(), channelAccountId);
  revalidatePath("/configuracoes");
  return resultado;
}

export async function actionReabrirRelacaoCanal(channelAccountId: string) {
  const resultado = await reabrirRelacaoCanal(await getCrudContext(), channelAccountId);
  revalidatePath("/configuracoes");
  return resultado;
}

export async function actionEstadoAutorizacaoExclusao(channelAccountId: string) {
  return estadoAutorizacaoExclusao(await getCrudContext(), channelAccountId);
}

export async function actionAutorizarExclusaoCanal(input: unknown) {
  return autorizarExclusaoCanal(await getCrudContext(), input);
}

export async function actionExecutarExclusaoCanal(channelAccountId: string) {
  const resultado = await executarExclusaoCanal(await getCrudContext(), channelAccountId);
  revalidatePath("/configuracoes");
  return resultado;
}

export async function actionBaixarBackup(backupId: unknown) {
  return baixarBackup(await getCrudContext(), backupId);
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
  revalidateTag(REPUTACAO_CACHE_TAG, "max");
  revalidateTag(PUBLICACOES_CACHE_TAG, "max");
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

export async function actionListarRotinasAgendadas() {
  const ctx = await getCrudContext();
  assertPerfil(ctx, ["admin", "gestor"]);
  return listarRotinasAgendadas(ctx);
}

export async function actionObterResumoConfiguracoes() {
  return obterResumoConfiguracoes(await getCrudContext());
}

export async function actionObterUsoApiShopee() {
  const ctx = await getCrudContext();
  assertPerfil(ctx, ["admin", "gestor"]);
  return obterUsoApiShopee(ctx);
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
