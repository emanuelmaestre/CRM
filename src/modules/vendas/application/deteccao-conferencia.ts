import "server-only";

import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { db } from "@/shared/lib/db";
import { conferenciaFinanceira, pedido, pedidoItem } from "@/shared/lib/db/schema/vendas";
import {
  decomporPedido,
  emReais,
  precisaResolver,
  type DecomposicaoPedido,
  type ItemConferencia,
  type PedidoConferencia,
} from "../domain/auditoria-financeira";

/* ── Detecção da conferência financeira, dentro da ingestão ────────────────
   A conta (soma dos elementos × valor bruto) é aritmética pura sobre dados
   que já estão no banco. Então ela roda no instante em que o financeiro de um
   pedido muda — dentro de `reconciliarFinanceiroPedido`, na mesma transação —
   e não numa varredura diária. Custo: uma leitura e um upsert, zero chamada
   de API.

   Aqui só se DETECTA e registra. Re-buscar na API e regravar (a parte cara) é
   responsabilidade do job A35, que também promove `detectado → persistente` e
   dispara o alerta. Estados do ledger:

     detectado  → a soma não fechou; a API do canal ainda não foi re-consultada
     aguardando → Shopee dentro da carência de liberação do repasse
     persistente→ o A35 re-buscou e mesmo assim não fecha (é o que alerta)
     resolvida  → fechou */

export type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

export const CANAIS_CONFERENCIA = ["mercadolivre", "shopee", "tiktokshop"] as const;
const DIA_MS = 24 * 60 * 60 * 1_000;

export type StatusConferencia = "detectado" | "aguardando" | "persistente" | "resolvida";

/** Aberto = precisa de olho humano. `detectado` entra: é divergência real, só
 *  ainda não re-verificada contra a API. */
export const STATUS_ABERTOS: readonly StatusConferencia[] = ["detectado", "aguardando", "persistente"];

export interface LinhaPedidoConferencia {
  id: string;
  brandId: string;
  canal: string;
  providerOrderId: string | null;
  total: string;
  frete: string | null;
  desconto: string | null;
  acrescimo: string | null;
  valorLiquido: string | null;
  dadosOrigem: unknown;
  createdAt: Date;
}

export const COLUNAS_PEDIDO_CONFERENCIA = {
  id: pedido.id,
  brandId: pedido.brandId,
  canal: pedido.canal,
  providerOrderId: pedido.providerOrderId,
  total: pedido.total,
  frete: pedido.frete,
  desconto: pedido.desconto,
  acrescimo: pedido.acrescimo,
  valorLiquido: pedido.valorLiquido,
  dadosOrigem: pedido.dadosOrigem,
  createdAt: pedido.createdAt,
} as const;

export function versaoFinanceiraPedidoSql() {
  return sql`jsonb_build_object(
    'regra', 2,
    'total', ${pedido.total},
    'frete', ${pedido.frete},
    'desconto', ${pedido.desconto},
    'acrescimo', ${pedido.acrescimo},
    'valorLiquido', ${pedido.valorLiquido},
    'financeiroInformado', ${pedido.dadosOrigem}->'financeiroInformado',
    'itens', coalesce((
      select jsonb_agg(jsonb_build_array(pi.id, pi.preco_unitario, pi.quantidade, pi.taxa_marketplace) order by pi.id)
      from pedido_item pi
      where pi.pedido_id = ${pedido.id}
    ), '[]'::jsonb)
  )`;
}

export function paraConferencia(
  linha: LinhaPedidoConferencia,
  itens: ItemConferencia[],
  agora: Date,
): PedidoConferencia {
  const financeiroInformado = (linha.dadosOrigem as { financeiroInformado?: boolean } | null)?.financeiroInformado;
  return {
    canal: linha.canal,
    total: linha.total,
    frete: linha.frete,
    desconto: linha.desconto,
    acrescimo: linha.acrescimo,
    valorLiquido: linha.valorLiquido,
    financeiroInformado,
    itens,
    idadeDias: Math.max(0, (agora.getTime() - linha.createdAt.getTime()) / DIA_MS),
  };
}

export function fotoFinanceira(
  linha: Pick<LinhaPedidoConferencia, "total" | "frete" | "desconto" | "acrescimo" | "valorLiquido">,
) {
  return {
    total: linha.total,
    frete: linha.frete,
    desconto: linha.desconto,
    acrescimo: linha.acrescimo,
    valorLiquido: linha.valorLiquido,
  };
}

const reaisOuNulo = (centavos: number | null): number | null => (centavos == null ? null : emReais(centavos));

export function montarLog(opts: {
  inicial: DecomposicaoPedido;
  final: DecomposicaoPedido;
  itens: ItemConferencia[];
  antes: ReturnType<typeof fotoFinanceira>;
  depois: ReturnType<typeof fotoFinanceira> | null;
  origem: "ingestao" | "a35";
  rebusca: "ok" | "sem_resposta" | "erro_ingestao" | "nao_tentada" | "adiada";
  apiConsultadaEm: string | null;
}) {
  const { final } = opts;
  return {
    canal: final.canal,
    origem: opts.origem,
    brutoInformado: emReais(final.brutoInformadoCentavos),
    somaComponentes: emReais(final.somaComponentesCentavos),
    residuoBruto: emReais(final.residuoBrutoCentavos),
    liquidoInformado: reaisOuNulo(final.liquidoInformadoCentavos),
    liquidoReconstruido: reaisOuNulo(final.liquidoReconstruidoCentavos),
    residuoLiquido: reaisOuNulo(final.residuoLiquidoCentavos),
    itens: opts.itens.map((item) => ({
      preco: Number(item.precoUnitario),
      qtd: item.quantidade,
      taxa: item.taxaMarketplace == null ? null : Number(item.taxaMarketplace),
    })),
    frete: opts.antes.frete,
    desconto: opts.antes.desconto,
    acrescimo: opts.antes.acrescimo,
    classificacaoInicial: opts.inicial.classificacao,
    classificacaoFinal: final.classificacao,
    detalhe: final.detalhe,
    rebusca: opts.rebusca,
    antes: opts.antes,
    depois: opts.depois,
    apiConsultadaEm: opts.apiConsultadaEm,
  };
}

export async function carregarItensConferencia(
  exec: Executor,
  pedidoIds: string[],
): Promise<Map<string, ItemConferencia[]>> {
  const mapa = new Map<string, ItemConferencia[]>();
  if (pedidoIds.length === 0) return mapa;
  const linhas = await exec
    .select({
      pedidoId: pedidoItem.pedidoId,
      precoUnitario: pedidoItem.precoUnitario,
      quantidade: pedidoItem.quantidade,
      taxaMarketplace: pedidoItem.taxaMarketplace,
    })
    .from(pedidoItem)
    .where(inArray(pedidoItem.pedidoId, pedidoIds));
  for (const linha of linhas) {
    const lista = mapa.get(linha.pedidoId) ?? [];
    lista.push({ precoUnitario: linha.precoUnitario, quantidade: linha.quantidade, taxaMarketplace: linha.taxaMarketplace });
    mapa.set(linha.pedidoId, lista);
  }
  return mapa;
}

function numeroOuNulo(centavos: number | null): string | null {
  return centavos == null ? null : emReais(centavos).toFixed(2);
}

/** Upsert de uma linha do ledger. `incrementarTentativa` só quando houve uma
 *  re-busca real (A35) — a detecção na ingestão nunca incrementa. */
export async function registrarConferencia(exec: Executor, entrada: {
  orgId: string;
  pedidoId: string;
  brandId: string;
  canal: string;
  providerOrderId: string | null;
  decomposicao: DecomposicaoPedido;
  status: StatusConferencia;
  log: unknown;
  incrementarTentativa: boolean;
  agora: Date;
}): Promise<void> {
  const { decomposicao: d, status, agora } = entrada;
  const comuns = {
    canal: entrada.canal,
    providerOrderId: entrada.providerOrderId,
    brutoInformado: emReais(d.brutoInformadoCentavos).toFixed(2),
    somaComponentes: emReais(d.somaComponentesCentavos).toFixed(2),
    residuoBrutoCentavos: d.residuoBrutoCentavos,
    liquidoInformado: numeroOuNulo(d.liquidoInformadoCentavos),
    liquidoReconstruido: numeroOuNulo(d.liquidoReconstruidoCentavos),
    residuoLiquidoCentavos: d.residuoLiquidoCentavos,
    classificacao: d.classificacao,
    status,
    componentes: entrada.log,
    ultimaVerificacaoEm: agora,
    resolvidoEm: status === "resolvida" ? agora : null,
  };
  await exec
    .insert(conferenciaFinanceira)
    .values({
      orgId: entrada.orgId,
      brandId: entrada.brandId,
      pedidoId: entrada.pedidoId,
      tentativasRebusca: entrada.incrementarTentativa ? 1 : 0,
      ...comuns,
    })
    .onConflictDoUpdate({
      target: [conferenciaFinanceira.orgId, conferenciaFinanceira.pedidoId],
      set: {
        ...comuns,
        tentativasRebusca: entrada.incrementarTentativa
          ? sql`${conferenciaFinanceira.tentativasRebusca} + 1`
          : conferenciaFinanceira.tentativasRebusca,
      },
    });
}

/** `ok`/`nao_aplicavel` de novo: fecha as linhas abertas destes pedidos. */
export async function fecharConferencias(exec: Executor, orgId: string, pedidoIds: string[]): Promise<void> {
  if (pedidoIds.length === 0) return;
  await exec
    .update(conferenciaFinanceira)
    .set({ status: "resolvida", classificacao: "ok", ultimaVerificacaoEm: new Date(), resolvidoEm: new Date() })
    .where(and(
      eq(conferenciaFinanceira.orgId, orgId),
      inArray(conferenciaFinanceira.pedidoId, pedidoIds),
      notInArray(conferenciaFinanceira.status, ["resolvida"]),
    ));
}

/**
 * Detecção barata de UM pedido, chamada de dentro da ingestão (na transação).
 * Decompõe pelo que acabou de ser gravado e registra no ledger — sem chamar
 * nenhuma API. Nunca lança: uma falha aqui não pode desfazer a ingestão.
 */
export async function conferirPedidoAposIngestao(
  exec: Executor,
  orgId: string,
  pedidoId: string,
): Promise<void> {
  try {
    const [linha] = await exec
      .select(COLUNAS_PEDIDO_CONFERENCIA)
      .from(pedido)
      .where(and(eq(pedido.id, pedidoId), eq(pedido.orgId, orgId)))
      .limit(1);
    if (!linha) return;
    const canal = linha.canal;
    if (!(CANAIS_CONFERENCIA as readonly string[]).includes(canal)) return;

    const agora = new Date();
    const itens = (await carregarItensConferencia(exec, [pedidoId])).get(pedidoId) ?? [];
    const decomposicao = decomporPedido(paraConferencia(linha as LinhaPedidoConferencia, itens, agora));
    const marcarVerificado = async () => {
      await exec.update(pedido).set({
        dadosOrigem: sql`jsonb_set(case when jsonb_typeof(${pedido.dadosOrigem}) = 'object' then ${pedido.dadosOrigem} else '{}'::jsonb end, '{conferenciaFinanceiraVersao}', ${versaoFinanceiraPedidoSql()}, true)`,
      }).where(and(eq(pedido.id, pedidoId), eq(pedido.orgId, orgId)));
    };

    if (decomposicao.classificacao === "nao_aplicavel" || decomposicao.classificacao === "ok") {
      await fecharConferencias(exec, orgId, [pedidoId]);
      await marcarVerificado();
      return;
    }
    if (!precisaResolver(decomposicao.classificacao)) return;

    const [existente] = await exec
      .select({ status: conferenciaFinanceira.status })
      .from(conferenciaFinanceira)
      .where(and(eq(conferenciaFinanceira.orgId, orgId), eq(conferenciaFinanceira.pedidoId, pedidoId)))
      .limit(1);

    // O veredito do A35 (`persistente`) manda até ele mesmo re-verificar.
    const status: StatusConferencia =
      decomposicao.classificacao === "aguardando_repasse" ? "aguardando"
        : existente?.status === "persistente" ? "persistente"
          : "detectado";

    const antes = fotoFinanceira(linha as LinhaPedidoConferencia);
    await registrarConferencia(exec, {
      orgId,
      pedidoId,
      brandId: linha.brandId,
      canal,
      providerOrderId: linha.providerOrderId,
      decomposicao,
      status,
      incrementarTentativa: false,
      agora,
      log: montarLog({
        inicial: decomposicao, final: decomposicao, itens,
        antes, depois: null, origem: "ingestao", rebusca: "nao_tentada", apiConsultadaEm: null,
      }),
    });
    await marcarVerificado();
  } catch (erro) {
    console.warn(`[conferencia] detecção na ingestão falhou para o pedido ${pedidoId}:`, erro);
  }
}
