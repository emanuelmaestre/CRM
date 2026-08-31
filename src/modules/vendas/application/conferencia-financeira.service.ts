import "server-only";

import { and, desc, eq, gte, inArray, isNotNull, notExists, sql } from "drizzle-orm";
import { db } from "@/shared/lib/db";
import { brand } from "@/shared/lib/db/schema/org";
import { conferenciaFinanceira, pedido } from "@/shared/lib/db/schema/vendas";
import { assertPerfil, type CrudContext } from "@/shared/lib/crud-factory";
import { ingerirPedido } from "@/modules/canais/application/ingestao-pedido.service";
import { emitirEventoUnico } from "@/shared/events";
import { rebuscarNoCanal } from "./pedidos-ignorados.service";
import {
  carregarItensConferencia,
  conferirPedidoAposIngestao,
  fecharConferencias,
  fotoFinanceira,
  montarLog,
  paraConferencia,
  registrarConferencia,
  CANAIS_CONFERENCIA,
  COLUNAS_PEDIDO_CONFERENCIA,
  STATUS_ABERTOS,
  type LinhaPedidoConferencia,
  type StatusConferencia,
} from "./deteccao-conferencia";
import { decomporPedido, type ItemConferencia } from "../domain/auditoria-financeira";

const DIA_MS = 24 * 60 * 60 * 1_000;

/* ── Camada de segurança: agir só quando precisa, sem torrar cota ──────────
   A detecção (a conta em si) já roda na ingestão, de graça — ver
   `deteccao-conferencia.ts`. O A35 aqui faz só a parte cara: re-buscar na API
   do canal e regravar. Três travas:

   1. BACKSTOP, não motor — o sweep varre só pedido SEM linha no ledger (o que
      a ingestão não pegou: histórico, ou algum caminho que não passou pelo
      `reconciliarFinanceiroPedido`). Em regime, é quase vazio.

   2. COOLDOWN de 7 dias — divergência já `persistente` não é re-buscada de
      novo todo dia. Pedido travado há 3 semanas não conserta na 15ª chamada.
      `detectado` (a ingestão achou, ninguém re-verificou) sempre entra.

   3. ALERTA POR EXCEÇÃO — WhatsApp do admin só quando um pedido ENTRA em
      `persistente`. `emitirEventoUnico` ainda segura: 1 aviso por conta / 6 dias. */
const COOLDOWN_REBUSCA_MS = 7 * DIA_MS;
const JANELA_ALERTA_MINUTOS = 6 * 24 * 60;
const MAX_BACKSTOP = 500;
/** O hook da ingestão já cobre o tempo real. O backstop só limpa o que ele
 *  não pega — importação histórica (`historico: true`, sem hook) e pedidos
 *  anteriores ao recurso. Filtra por `atualizado_em` (bump a cada ingestão),
 *  não por data da compra, senão a história importada agora escaparia. Janela
 *  curta: em regime é quase vazio. */
const BACKSTOP_JANELA_MS = 3 * DIA_MS;

type LinhaComRebusca = LinhaPedidoConferencia & { brandSlug: string; channelAccountId: string | null };

const COLUNAS_REBUSCA = {
  ...COLUNAS_PEDIDO_CONFERENCIA,
  brandSlug: brand.slug,
  channelAccountId: pedido.channelAccountId,
} as const;

export interface ResumoAuditoria {
  backstop: number;
  candidatos: number;
  rebuscas: number;
  emCooldown: number;
  resolvidos: number;
  persistentes: number;
  aguardando: number;
  novasPersistentes: number;
  alertou: boolean;
}

/** Parte cara da conferência de UMA conta: re-busca na API do canal os pedidos
 *  cuja soma não fechou e regrava pelo caminho do `reconciliarFinanceiroPedido`
 *  (via `ingerirPedido`, que já re-roda a detecção). O resíduo que sobrar vira
 *  `persistente` — nunca um valor calculado aqui. */
export async function auditarPedidosDaConta(
  orgId: string,
  channelAccountId: string,
  opts: { maxRebuscas?: number; agora?: Date } = {},
): Promise<ResumoAuditoria> {
  const agora = opts.agora ?? new Date();
  const maxRebuscas = opts.maxRebuscas ?? 50;
  const resumo: ResumoAuditoria = {
    backstop: 0, candidatos: 0, rebuscas: 0, emCooldown: 0,
    resolvidos: 0, persistentes: 0, aguardando: 0, novasPersistentes: 0, alertou: false,
  };
  const exemplosNovos: string[] = [];

  // ── 1. Backstop: pedido ingerido há pouco e ainda sem linha no ledger
  // (importação histórica pula o hook; pedidos antigos idem).
  const backstopDesde = new Date(agora.getTime() - BACKSTOP_JANELA_MS);
  const semLedger = await db
    .select({ id: pedido.id })
    .from(pedido)
    .where(and(
      eq(pedido.orgId, orgId),
      eq(pedido.channelAccountId, channelAccountId),
      gte(pedido.updatedAt, backstopDesde),
      inArray(pedido.canal, [...CANAIS_CONFERENCIA]),
      notExists(
        db.select({ um: sql`1` }).from(conferenciaFinanceira).where(and(
          eq(conferenciaFinanceira.orgId, orgId),
          eq(conferenciaFinanceira.pedidoId, pedido.id),
        )),
      ),
    ))
    .limit(MAX_BACKSTOP);
  for (const { id } of semLedger) {
    await conferirPedidoAposIngestao(db, orgId, id);
    resumo.backstop += 1;
  }

  // ── 2. Candidatos a re-busca: linhas abertas da conta.
  const candidatos = await db
    .select({
      ...COLUNAS_REBUSCA,
      ledgerStatus: conferenciaFinanceira.status,
      ledgerVerificadoEm: conferenciaFinanceira.ultimaVerificacaoEm,
    })
    .from(conferenciaFinanceira)
    .innerJoin(pedido, and(eq(pedido.id, conferenciaFinanceira.pedidoId), eq(pedido.orgId, conferenciaFinanceira.orgId)))
    .innerJoin(brand, eq(brand.id, pedido.brandId))
    .where(and(
      eq(conferenciaFinanceira.orgId, orgId),
      eq(pedido.channelAccountId, channelAccountId),
      inArray(conferenciaFinanceira.status, ["detectado", "aguardando", "persistente"]),
      isNotNull(pedido.providerOrderId),
    ))
    .orderBy(conferenciaFinanceira.ultimaVerificacaoEm);

  for (const linha of candidatos) {
    resumo.candidatos += 1;
    const status = linha.ledgerStatus as StatusConferencia;

    // Cooldown: só `detectado` fura. persistente/aguardando esperam 7 dias.
    const frio = agora.getTime() - linha.ledgerVerificadoEm.getTime() < COOLDOWN_REBUSCA_MS;
    if (status !== "detectado" && frio) {
      resumo.emCooldown += 1;
      continue;
    }
    if (resumo.rebuscas >= maxRebuscas || !linha.channelAccountId || !linha.providerOrderId) continue;

    resumo.rebuscas += 1;
    const apiConsultadaEm = new Date().toISOString();
    const antes = fotoFinanceira(linha as LinhaComRebusca);
    const atualizado = await rebuscarNoCanal({
      canal: linha.canal,
      brandSlug: linha.brandSlug,
      providerOrderId: linha.providerOrderId,
    });

    if (!atualizado) {
      // API sem resposta: bump da verificação para o cooldown pegar, sem mudar o veredito.
      await db
        .update(conferenciaFinanceira)
        .set({ ultimaVerificacaoEm: agora, tentativasRebusca: sql`${conferenciaFinanceira.tentativasRebusca} + 1` })
        .where(and(eq(conferenciaFinanceira.orgId, orgId), eq(conferenciaFinanceira.pedidoId, linha.id)));
      continue;
    }

    try {
      // `historico: true` para não re-disparar eventos de um pedido já
      // processado. A detecção do hook fica de fora nesse modo; o A35 escreve
      // o veredito ele mesmo, logo abaixo.
      await ingerirPedido(orgId, linha.brandId, linha.channelAccountId, atualizado, { historico: true });
    } catch (erro) {
      console.warn(`[A35] falha ao regravar ${linha.canal}/${linha.providerOrderId}:`, erro);
      continue;
    }

    const recarregado = await recarregarParaConferencia(orgId, linha.id);
    if (!recarregado) continue;
    const decomposicao = decomporPedido(paraConferencia(recarregado.linha, recarregado.itens, agora));
    const log = montarLog({
      inicial: decomposicao, final: decomposicao, itens: recarregado.itens,
      antes, depois: fotoFinanceira(recarregado.linha), origem: "a35",
      rebusca: "ok", apiConsultadaEm,
    });

    // Fechou (ou virou não_aplicável) → resolvida.
    if (decomposicao.classificacao === "ok" || decomposicao.classificacao === "nao_aplicavel") {
      await fecharConferencias(db, orgId, [linha.id]);
      resumo.resolvidos += 1;
      continue;
    }
    // Repasse ainda não liberado → segue aguardando, sem alerta.
    if (decomposicao.classificacao === "aguardando_repasse") {
      await registrarConferencia(db, {
        orgId, pedidoId: linha.id, brandId: linha.brandId, canal: linha.canal,
        providerOrderId: linha.providerOrderId, decomposicao, status: "aguardando",
        incrementarTentativa: true, agora, log,
      });
      resumo.aguardando += 1;
      continue;
    }

    // Re-buscou e a soma ainda não fecha → é `persistente` de fato.
    await registrarConferencia(db, {
      orgId, pedidoId: linha.id, brandId: linha.brandId, canal: linha.canal,
      providerOrderId: linha.providerOrderId, decomposicao, status: "persistente",
      incrementarTentativa: true, agora, log,
    });
    resumo.persistentes += 1;
    if (status !== "persistente") {
      resumo.novasPersistentes += 1;
      if (exemplosNovos.length < 5) exemplosNovos.push(linha.providerOrderId ?? linha.id);
    }
  }

  // ── 3. Alerta por exceção.
  if (resumo.novasPersistentes > 0 && candidatos[0]) {
    try {
      resumo.alertou = await emitirEventoUnico({
        tipo: "conferencia.divergencia_persistente",
        orgId,
        brandId: candidatos[0].brandId,
        entidade: "channel_account",
        entidadeId: channelAccountId,
        payload: {
          tipo: candidatos[0].canal,
          novas: resumo.novasPersistentes,
          totalPersistente: resumo.persistentes + resumo.emCooldown,
          exemplos: exemplosNovos,
        },
      }, JANELA_ALERTA_MINUTOS);
    } catch (erro) {
      console.warn(`[A35] falha ao emitir alerta de conferência para a conta ${channelAccountId}:`, erro);
    }
  }

  return resumo;
}

async function recarregarParaConferencia(
  orgId: string,
  pedidoId: string,
): Promise<{ linha: LinhaPedidoConferencia; itens: ItemConferencia[] } | null> {
  const [linha] = await db
    .select(COLUNAS_PEDIDO_CONFERENCIA)
    .from(pedido)
    .where(and(eq(pedido.orgId, orgId), eq(pedido.id, pedidoId)))
    .limit(1);
  if (!linha) return null;
  const itens = (await carregarItensConferencia(db, [pedidoId])).get(pedidoId) ?? [];
  return { linha: linha as LinhaPedidoConferencia, itens };
}

export interface ConferenciaAberta {
  id: string;
  canal: string;
  providerOrderId: string | null;
  classificacao: string;
  status: string;
  brutoInformado: string;
  somaComponentes: string;
  residuoBrutoCentavos: number;
  residuoLiquidoCentavos: number | null;
  tentativasRebusca: number;
  componentes: unknown;
  primeiraDeteccaoEm: string;
  ultimaVerificacaoEm: string;
}

export async function listarConferenciasAbertas(ctx: CrudContext): Promise<{
  itens: ConferenciaAberta[];
  totais: { detectados: number; persistentes: number; aguardando: number; resolvidas30d: number };
}> {
  assertPerfil(ctx, ["admin", "gestor"]);

  const linhas = await ctx.db
    .select({
      id: conferenciaFinanceira.id,
      canal: conferenciaFinanceira.canal,
      providerOrderId: conferenciaFinanceira.providerOrderId,
      classificacao: conferenciaFinanceira.classificacao,
      status: conferenciaFinanceira.status,
      brutoInformado: conferenciaFinanceira.brutoInformado,
      somaComponentes: conferenciaFinanceira.somaComponentes,
      residuoBrutoCentavos: conferenciaFinanceira.residuoBrutoCentavos,
      residuoLiquidoCentavos: conferenciaFinanceira.residuoLiquidoCentavos,
      tentativasRebusca: conferenciaFinanceira.tentativasRebusca,
      componentes: conferenciaFinanceira.componentes,
      primeiraDeteccaoEm: conferenciaFinanceira.primeiraDeteccaoEm,
      ultimaVerificacaoEm: conferenciaFinanceira.ultimaVerificacaoEm,
    })
    .from(conferenciaFinanceira)
    .where(and(
      eq(conferenciaFinanceira.orgId, ctx.orgId),
      inArray(conferenciaFinanceira.status, [...STATUS_ABERTOS]),
    ))
    .orderBy(desc(conferenciaFinanceira.ultimaVerificacaoEm))
    .limit(200);

  const [contagem] = await ctx.db
    .select({
      detectados: sql<number>`count(*) filter (where ${conferenciaFinanceira.status} = 'detectado')::int`,
      persistentes: sql<number>`count(*) filter (where ${conferenciaFinanceira.status} = 'persistente')::int`,
      aguardando: sql<number>`count(*) filter (where ${conferenciaFinanceira.status} = 'aguardando')::int`,
      resolvidas30d: sql<number>`count(*) filter (where ${conferenciaFinanceira.status} = 'resolvida' and ${conferenciaFinanceira.resolvidoEm} > now() - interval '30 days')::int`,
    })
    .from(conferenciaFinanceira)
    .where(eq(conferenciaFinanceira.orgId, ctx.orgId));

  return {
    itens: linhas.map((linha) => ({
      ...linha,
      primeiraDeteccaoEm: linha.primeiraDeteccaoEm.toISOString(),
      ultimaVerificacaoEm: linha.ultimaVerificacaoEm.toISOString(),
    })),
    totais: {
      detectados: contagem?.detectados ?? 0,
      persistentes: contagem?.persistentes ?? 0,
      aguardando: contagem?.aguardando ?? 0,
      resolvidas30d: contagem?.resolvidas30d ?? 0,
    },
  };
}
