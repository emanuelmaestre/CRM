import { and, desc, eq } from "drizzle-orm";
import { assertPerfil, type CrudContext } from "@/shared/lib/crud-factory";
import { channelAccount, sincronizacaoExecucao } from "@/shared/lib/db/schema";
import { inngest } from "@/shared/lib/inngest/client";

/** Central de Sincronização (Configurações): dispara a fila completa de uma
 *  conta de canal em background, em vez do usuário esperar uma chamada
 *  síncrona que pode estourar o timeout sob a fila de conexão única do
 *  banco. A execução fica registrada aqui; a tela faz polling do status em
 *  vez de segurar a requisição aberta. */
export async function dispararSincronizacaoConta(ctx: CrudContext, channelAccountId: string) {
  assertPerfil(ctx, ["admin", "gestor"]);

  const conta = await ctx.db
    .select({ id: channelAccount.id, status: channelAccount.status })
    .from(channelAccount)
    .where(and(eq(channelAccount.id, channelAccountId), eq(channelAccount.orgId, ctx.orgId)))
    .then((rows) => rows[0]);
  if (!conta) throw new Error("Conta de canal não encontrada.");
  if (conta.status !== "conectado") throw new Error("Conta não está conectada.");

  const [execucao] = await ctx.db.insert(sincronizacaoExecucao).values({
    orgId: ctx.orgId,
    channelAccountId,
  }).returning();

  await inngest.send({
    id: `sincronizacao-conta-${execucao.id}`,
    name: "canal/sincronizacao.solicitada",
    data: { orgId: ctx.orgId, channelAccountId, execucaoId: execucao.id },
  });

  return execucao;
}

/** Última execução (em andamento ou concluída) de uma conta — o que a tela
 *  faz polling pra desenhar o progresso por módulo. */
export async function obterUltimaSincronizacaoConta(ctx: CrudContext, channelAccountId: string) {
  return ctx.db
    .select()
    .from(sincronizacaoExecucao)
    .where(and(eq(sincronizacaoExecucao.orgId, ctx.orgId), eq(sincronizacaoExecucao.channelAccountId, channelAccountId)))
    .orderBy(desc(sincronizacaoExecucao.iniciadoEm))
    .limit(1)
    .then((rows) => rows[0] ?? null);
}
