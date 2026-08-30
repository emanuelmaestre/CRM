import { and, desc, eq, isNull } from "drizzle-orm";
import { assertPerfil, type CrudContext } from "@/shared/lib/crud-factory";
import { channelAccount, sincronizacaoExecucao } from "@/shared/lib/db/schema";
import { inngest } from "@/shared/lib/inngest/client";
import {
  CAMPOS_MODULO_SINCRONIZACAO,
  LIMITE_EXECUCAO_ABANDONADA_MS,
  INTERVALO_MINIMO_VERIFICACAO_MS,
  MODULOS_SINCRONIZACAO,
  type ModuloSincronizacao,
} from "../domain/sincronizacao-progresso";

/** Central de Sincronização (Configurações): dispara a fila completa de uma
 *  conta de canal em background, em vez do usuário esperar uma chamada
 *  síncrona que pode estourar o timeout sob a fila de conexão única do
 *  banco. A execução fica registrada aqui; a tela faz polling do status em
 *  vez de segurar a requisição aberta. */
export async function dispararSincronizacaoConta(
  ctx: CrudContext,
  channelAccountId: string,
  opcoes: {
    modulos?: readonly ModuloSincronizacao[];
    /** Início da varredura de Pedidos. Sem isto, um pedido de módulo usa as
     *  últimas 24h (é o que a tela quer: "confere agora o que acabou de
     *  entrar"). A reconciliação diária (A34) passa uma janela maior, porque o
     *  buraco que ela existe pra tapar é justamente o pedido que a janela
     *  curta já deixou pra trás. */
    desde?: Date;
    reconciliacao?: boolean;
  } = {},
) {
  assertPerfil(ctx, ["admin", "gestor"]);

  const conta = await ctx.db
    .select({ id: channelAccount.id, status: channelAccount.status })
    .from(channelAccount)
    .where(and(eq(channelAccount.id, channelAccountId), eq(channelAccount.orgId, ctx.orgId)))
    .then((rows) => rows[0]);
  if (!conta) throw new Error("Conta de canal não encontrada.");
  if (conta.status !== "conectado") throw new Error("Conta não está conectada.");

  // Clique repetido acompanha a execução viva em vez de criar outra fila e
  // repetir chamadas aos marketplaces (especialmente à Shopee/Webshare).
  const ativa = await ctx.db
    .select()
    .from(sincronizacaoExecucao)
    .where(and(
      eq(sincronizacaoExecucao.orgId, ctx.orgId),
      eq(sincronizacaoExecucao.channelAccountId, channelAccountId),
      isNull(sincronizacaoExecucao.finalizadoEm),
    ))
    .orderBy(desc(sincronizacaoExecucao.iniciadoEm))
    .limit(1)
    .then((rows) => rows[0]);
  if (ativa && Date.now() - ativa.iniciadoEm.getTime() <= LIMITE_EXECUCAO_ABANDONADA_MS) {
    if (opcoes.reconciliacao) throw new Error("Reconciliação adiada: há outra execução ativa; sua janela não foi certificada.");
    return ativa;
  }

  /* Execução abandonada é ENCERRADA no banco, não só na leitura.
     `obterUltimaSincronizacaoConta` sintetiza o desfecho ao ler, sem gravar:
     a Central mostrava "Finalizada com alerta" enquanto a linha seguia com
     `finalizado_em` nulo. Aí os dois lados discordavam sobre a mesma
     execução — o cabeçalho do painel a contava como ativa (o anel parado em
     36% em 27/08/2026, com nada rodando) e ela ficava aberta para sempre.
     Fechar aqui, antes de criar a próxima, é o que faz os dois lados
     concordarem e impede que linhas mortas se acumulem. */
  if (ativa) {
    const encerramento: Partial<typeof sincronizacaoExecucao.$inferInsert> = { finalizadoEm: new Date() };
    for (const modulo of MODULOS_SINCRONIZACAO) {
      const campos = CAMPOS_MODULO_SINCRONIZACAO[modulo];
      if (ativa[campos.status] === "pendente" || ativa[campos.status] === "em_andamento") {
        (encerramento as Record<string, unknown>)[campos.status] = "erro";
        if (!ativa[campos.erro]) (encerramento as Record<string, unknown>)[campos.erro] = MOTIVO_ABANDONADA;
      }
    }
    await ctx.db.update(sincronizacaoExecucao)
      .set(encerramento)
      .where(eq(sincronizacaoExecucao.id, ativa.id));
  }

  const solicitados = new Set<ModuloSincronizacao>(
    opcoes.modulos?.length ? opcoes.modulos : MODULOS_SINCRONIZACAO,
  );

  /* Intervalo mínimo entre verificações manuais do mesmo módulo.
     A dedução acima cobre o clique repetido enquanto algo roda; esta cobre o
     caso seguinte — terminou às 10:40, alguém pede de novo às 10:41. Sem ela,
     refazer na mão o que a rotina acabou de trazer é gasto puro de cota do
     Webshare. A fila completa de Configurações não passa por aqui: quem pede
     "sincronizar tudo" está pedindo explicitamente. */
  if (opcoes.modulos?.length && !opcoes.reconciliacao) {
    const recentes = await ctx.db
      .select()
      .from(sincronizacaoExecucao)
      .where(and(
        eq(sincronizacaoExecucao.orgId, ctx.orgId),
        eq(sincronizacaoExecucao.channelAccountId, channelAccountId),
      ))
      .orderBy(desc(sincronizacaoExecucao.iniciadoEm))
      .limit(5);

    for (const modulo of solicitados) {
      const campos = CAMPOS_MODULO_SINCRONIZACAO[modulo];
      const ultima = recentes.find((execucao) => execucao[campos.status] !== "pendente");
      if (!ultima) continue;
      const desde = Date.now() - ultima.iniciadoEm.getTime();
      if (desde < INTERVALO_MINIMO_VERIFICACAO_MS) {
        const faltam = Math.ceil((INTERVALO_MINIMO_VERIFICACAO_MS - desde) / 60_000);
        throw new Error(
          `Este módulo foi verificado há pouco. Tente de novo em ${faltam} min`
          + " — os dados atuais continuam na tela.",
        );
      }
    }
  }

  const patchModulos: Record<string, unknown> = {};
  for (const modulo of MODULOS_SINCRONIZACAO) {
    if (solicitados.has(modulo)) continue;
    const campos = CAMPOS_MODULO_SINCRONIZACAO[modulo];
    patchModulos[campos.status] = "concluido";
    patchModulos[campos.resultado] = { omitido: true, progresso: 100 };
  }

  const [execucao] = await ctx.db.insert(sincronizacaoExecucao).values({
    orgId: ctx.orgId,
    channelAccountId,
    ...patchModulos,
    // Compatibilidade com o histórico: as colunas continuam no banco, mas
    // novas execuções não chamam mais endpoints sem uso.
    reclamacoesStatus: "concluido",
    reclamacoesResultado: { desativado: true },
    mensagensStatus: "concluido",
    mensagensResultado: { desativado: true },
  }).returning();

  await inngest.send({
    id: `sincronizacao-conta-${execucao.id}`,
    name: "canal/sincronizacao.solicitada",
    data: {
      orgId: ctx.orgId,
      channelAccountId,
      execucaoId: execucao.id,
      modulos: [...solicitados],
      reconciliacao: opcoes.reconciliacao === true,
      // Atualização pontual de Pedidos é incremental. A fila completa de
      // Configurações continua sem `desde` e preserva a varredura de 90 dias.
      desde: opcoes.desde
        ? opcoes.desde.toISOString()
        : opcoes.modulos?.length
          ? new Date(Date.now() - 24 * 60 * 60 * 1_000).toISOString()
          : undefined,
    },
  });

  return execucao;
}

/** Uma execução normal leva poucos minutos. Se o job morre sem gravar o
 *  desfecho — função morta pelo limite de tempo, deploy no meio, Inngest
 *  desistindo depois das tentativas — a linha fica "em andamento" para sempre
 *  e a tela gira sem fim. Aconteceu em 25/08/2026 (45+ minutos girando) e de
 *  novo em 27/08. A folga de `LIMITE_EXECUCAO_ABANDONADA_MS` é generosa de
 *  propósito: marcar como falha uma execução que ainda vive é pior do que
 *  demorar um pouco pra desistir de uma morta. */
const MOTIVO_ABANDONADA = "Execução interrompida: o job parou de responder. Sincronize de novo.";

/** Última execução (em andamento ou concluída) de uma conta — o que a tela
 *  faz polling pra desenhar o progresso por módulo.
 *
 *  Execução parada além do limite é apresentada como falha. A linha no banco
 *  não é reescrita aqui de propósito: leitura não deveria ter efeito colateral,
 *  e o job pode acordar e retomar (os steps já concluídos ficam memoizados no
 *  Inngest). O que a pessoa vê passa a ser honesto — "isso não vai terminar" —
 *  sem impedir que a execução real termine se ainda estiver viva. */
export async function obterUltimaSincronizacaoConta(ctx: CrudContext, channelAccountId: string) {
  const execucao = await ctx.db
    .select()
    .from(sincronizacaoExecucao)
    .where(and(eq(sincronizacaoExecucao.orgId, ctx.orgId), eq(sincronizacaoExecucao.channelAccountId, channelAccountId)))
    .orderBy(desc(sincronizacaoExecucao.iniciadoEm))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!execucao || execucao.finalizadoEm) return execucao;
  const parada = Date.now() - execucao.iniciadoEm.getTime() > LIMITE_EXECUCAO_ABANDONADA_MS;
  if (!parada) return execucao;

  const abandonada = { ...execucao, finalizadoEm: new Date() };
  for (const modulo of MODULOS_SINCRONIZACAO) {
    const chaveStatus = `${modulo}Status` as const;
    const chaveErro = `${modulo}Erro` as const;
    if (abandonada[chaveStatus] === "pendente" || abandonada[chaveStatus] === "em_andamento") {
      abandonada[chaveStatus] = "erro";
      abandonada[chaveErro] = abandonada[chaveErro] ?? MOTIVO_ABANDONADA;
    }
  }
  return abandonada;
}
