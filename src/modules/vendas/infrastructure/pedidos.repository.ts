import { and, count, desc, eq, gte, ilike, inArray, lte, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/shared/lib/db";
import { brand, channelAccount, cliente, pedido, pedidoItem } from "@/shared/lib/db/schema";
import { compararPorOrdemDeMarca } from "@/shared/config/brands";
import { CANAIS_VENDA, type ConsultaPedidos, type IndicadorPedidos } from "../domain/consulta-pedidos";
import {
  dataVendaPedidoSql,
  pedidoComercialSql,
  reembolsoParcialPedidoSql,
} from "./valor-faturamento.sql";
import { composicaoResumoPedidosSql } from "./composicao-resumo.sql";
import { dataPagamentoShopeeSql, valorProdutosShopeeSql } from "./valor-shopee.sql";
import { pagamentoCancelamentoSql } from "./pagamento-cancelamento.sql";

function filtrosConsulta(orgId: string, opts: ConsultaPedidos): SQL[] {
  const filtros: SQL[] = [eq(pedido.orgId, orgId), pedidoComercialSql()];
  if (opts.brandIds?.length) filtros.push(inArray(pedido.brandId, opts.brandIds));
  if (opts.canais?.length) filtros.push(inArray(pedido.canal, opts.canais));
  if (opts.statuses?.length) filtros.push(inArray(pedido.status, opts.statuses));
  if (opts.inicio) filtros.push(gte(dataVendaPedidoSql(), opts.inicio.toISOString()));
  if (opts.fim) filtros.push(lte(dataVendaPedidoSql(), opts.fim.toISOString()));
  if (opts.busca?.trim()) {
    const termo = `%${opts.busca.trim()}%`;
    filtros.push(or(
      ilike(pedido.providerOrderId, termo),
      ilike(cliente.nome, termo),
      ilike(cliente.nomeCompleto, termo),
    )!);
  }
  return filtros;
}

export async function consultarPedidosDetalhados(
  orgId: string,
  opts: ConsultaPedidos & { limit: number; offset: number },
) {
  const filtros = filtrosConsulta(orgId, opts);
  const [data, totalRows] = await Promise.all([
    db
      .select({
        id: pedido.id,
        providerOrderId: pedido.providerOrderId,
        clienteNome: cliente.nome,
        brandId: pedido.brandId,
        brandNome: brand.name,
        brandSlug: brand.slug,
        canal: pedido.canal,
        status: pedido.status,
        total: pedido.total,
        frete: pedido.frete,
        desconto: pedido.desconto,
        origemIngestao: pedido.origemIngestao,
        receivedAt: pedido.receivedAt,
        createdAt: dataVendaPedidoSql(),
        quantidadeItens: sql<number>`coalesce((select sum(${pedidoItem.quantidade}) from ${pedidoItem} where ${pedidoItem.pedidoId} = ${pedido.id}), 0)`,
      })
      .from(pedido)
      .innerJoin(cliente, eq(cliente.id, pedido.clienteId))
      .innerJoin(brand, eq(brand.id, pedido.brandId))
      .where(and(...filtros))
      .orderBy(desc(dataVendaPedidoSql()))
      .limit(opts.limit)
      .offset(opts.offset),
    db
      .select({ total: count() })
      .from(pedido)
      .innerJoin(cliente, eq(cliente.id, pedido.clienteId))
      .where(and(...filtros)),
  ]);

  return { data, total: totalRows[0]?.total ?? 0, limit: opts.limit, offset: opts.offset };
}

/** Taxa que o canal cobrou por um pedido: soma dos itens, zero quando nenhum
 *  item tem taxa conhecida. Subconsulta, e não join, para não multiplicar a
 *  linha do pedido — ver o comentário em `consultarResumoPedidos`. */
const TAXA_DO_PEDIDO = sql`coalesce((
  select sum(${pedidoItem.taxaMarketplace}) from ${pedidoItem}
  where ${pedidoItem.pedidoId} = ${pedido.id}
), 0)`;
const REEMBOLSO_PARCIAL_DO_PEDIDO = reembolsoParcialPedidoSql();
const COMPOSICAO = composicaoResumoPedidosSql();
const CANCELADO_FINANCEIRO = COMPOSICAO.cancelado;
const DEVOLVIDO_FINANCEIRO = COMPOSICAO.devolvido;
const PAGAMENTO_CANCELAMENTO = pagamentoCancelamentoSql();
const CANCELADO_OPERACIONAL = sql`${COMPOSICAO.status} = 'cancelado'`;
const CANCELADO_SEM_PAGAMENTO = sql`${CANCELADO_OPERACIONAL} and ${PAGAMENTO_CANCELAMENTO} = 'sem-pagamento'`;

/** Consulta independente da página principal, com o mesmo recorte financeiro dos cards. */
export async function consultarPedidosDoIndicador(
  orgId: string,
  indicador: IndicadorPedidos,
  opts: ConsultaPedidos & { offset: number },
) {
  const parcial = indicador === "reembolsos-parciais";
  const condicao = indicador === "cancelados-sem-pagamento" ? CANCELADO_SEM_PAGAMENTO : indicador === "cancelados" ? CANCELADO_FINANCEIRO : indicador === "devolvidos" ? DEVOLVIDO_FINANCEIRO : indicador === "pendentes-confirmacao" ? COMPOSICAO.pendente : parcial
    ? sql`${COMPOSICAO.faturavel} and ${REEMBOLSO_PARCIAL_DO_PEDIDO} > 0`
    : sql`(${CANCELADO_FINANCEIRO} or ${DEVOLVIDO_FINANCEIRO})`;
  const linhas = await db.select({
    id: pedido.id,
    providerOrderId: pedido.providerOrderId,
    clienteNome: cliente.nome,
    canal: pedido.canal,
    status: COMPOSICAO.status,
    aguardandoPagamentoShopee: sql<boolean>`coalesce(${pedido.canal} = 'shopee' and ${pedido.dadosOrigem}->>'status' = 'UNPAID', false)`,
    pagamentoShopee: sql<string | null>`case when ${pedido.canal} = 'shopee' then case when ${dataPagamentoShopeeSql()} is not null then 'pago' when ${pedido.dadosOrigem}->>'pagamentoConsultado' = 'true' then 'sem-pagamento' else 'a-verificar' end else null end`,
    pagamentoCancelamento: PAGAMENTO_CANCELAMENTO,
    total: COMPOSICAO.valorOriginal,
    valorReembolsado: REEMBOLSO_PARCIAL_DO_PEDIDO,
    createdAt: dataVendaPedidoSql(),
  }).from(pedido)
    .innerJoin(cliente, eq(cliente.id, pedido.clienteId))
    .where(and(...filtrosConsulta(orgId, opts), condicao))
    .orderBy(desc(dataVendaPedidoSql()), desc(pedido.id))
    .limit(51)
    .offset(opts.offset);
  return {
    data: linhas.slice(0, 50).map((item) => ({
      ...item, total: Number(item.total), valorReembolsado: Number(item.valorReembolsado),
    })),
    hasMore: linhas.length > 50,
  };
}

/** Repasse do pedido. `valor_liquido` é o número que o canal informou (escrow
 *  da Shopee) e vale mais que qualquer reconstrução nossa: já traz subsídio de
 *  frete, tarifa de campanha e ajustes que a estimativa não enxerga. Para quem
 *  não informa (Mercado Livre, canais manuais), sobra a estimativa. */
const LIQUIDO_DO_PEDIDO = sql`coalesce(
  ${pedido.valorLiquido},
  ${COMPOSICAO.valorConfirmado} - ${TAXA_DO_PEDIDO} - coalesce(${pedido.frete}, 0)
)`;

export async function consultarResumoPedidos(orgId: string, opts: ConsultaPedidos) {
  const faturavel = COMPOSICAO.faturavel;
  const canceladoFinanceiro = CANCELADO_FINANCEIRO;
  const devolvidoFinanceiro = DEVOLVIDO_FINANCEIRO;
  const ajusteIntegralFinanceiro = sql`(${canceladoFinanceiro} or ${devolvidoFinanceiro})`;
  const [resumo] = await db
    .select({
      // Mesmo recorte do faturamento (somente pagamento confirmado): os dois
      // cards ficam lado a lado na tela, e contar aqui os cancelados que o
      // faturamento não conta fazia os números não fecharem entre si — quem
      // dividisse um pelo outro pra achar o ticket médio erraria. Cancelado e
      // devolvido já têm cards próprios ao lado, com quantidade e valor.
      totalPedidos: sql<number>`count(*) filter (where ${faturavel})`,
      totalBrutoPedidos: sql<number>`count(*) filter (where ${COMPOSICAO.bruto})`,
      totalBrutoComparavel: sql<string>`coalesce(sum(${COMPOSICAO.valorBruto}) filter (where ${COMPOSICAO.bruto}), 0)`,
      pendentesQtd: sql<number>`count(*) filter (where ${COMPOSICAO.pendente})`,
      pendentesValor: sql<string>`coalesce(sum(${COMPOSICAO.valorOriginal}) filter (where ${COMPOSICAO.pendente}), 0)`,
      faturamento: sql<string>`coalesce(sum(${COMPOSICAO.valorConfirmado}) filter (where ${faturavel}), 0)`,
      ticketMedio: sql<string>`coalesce(avg(${COMPOSICAO.valorConfirmado}) filter (where ${faturavel}), 0)`,
      cancelados: sql<number>`count(*) filter (where ${ajusteIntegralFinanceiro})`,
      canceladosQtd: sql<number>`count(*) filter (where ${canceladoFinanceiro})`,
      canceladosOperacionais: sql<number>`count(*) filter (where ${CANCELADO_OPERACIONAL})`,
      canceladosSemPagamento: sql<number>`count(*) filter (where ${CANCELADO_SEM_PAGAMENTO})`,
      canceladosPagamentoDesconhecido: sql<number>`count(*) filter (where ${CANCELADO_OPERACIONAL} and ${PAGAMENTO_CANCELAMENTO} = 'a-verificar')`,
      canceladosSemPagamentoValor: sql<string>`coalesce(sum(${COMPOSICAO.valorOriginal}) filter (where ${CANCELADO_SEM_PAGAMENTO}), 0)`,
      canceladosPagosShopee: sql<number>`count(*) filter (where ${canceladoFinanceiro} and ${pedido.canal} = 'shopee' and ${dataPagamentoShopeeSql()} is not null)`,
      canceladosSemPagamentoShopee: sql<number>`count(*) filter (where ${canceladoFinanceiro} and ${pedido.canal} = 'shopee' and ${dataPagamentoShopeeSql()} is null and ${pedido.dadosOrigem}->>'pagamentoConsultado' = 'true')`,
      canceladosSemPagamentoValorShopee: sql<string>`coalesce(sum(${COMPOSICAO.valorOriginal}) filter (where ${canceladoFinanceiro} and ${pedido.canal} = 'shopee' and ${dataPagamentoShopeeSql()} is null and ${pedido.dadosOrigem}->>'pagamentoConsultado' = 'true'), 0)`,
      canceladosValor: sql<string>`coalesce(sum(${COMPOSICAO.valorOriginal}) filter (where ${canceladoFinanceiro}), 0)`,
      devolvidosQtd: sql<number>`count(*) filter (where ${devolvidoFinanceiro})`,
      devolvidosValor: sql<string>`coalesce(sum(${COMPOSICAO.valorOriginal}) filter (where ${devolvidoFinanceiro}), 0)`,
      reembolsosParciaisQtd: sql<number>`count(*) filter (where ${faturavel} and ${REEMBOLSO_PARCIAL_DO_PEDIDO} > 0)`,
      reembolsosParciaisValor: sql<string>`coalesce(sum(${REEMBOLSO_PARCIAL_DO_PEDIDO}) filter (where ${faturavel}), 0)`,
      // Mesma regra do detalhe do pedido e de Métricas: o repasse informado
      // pelo canal manda; sem ele, a estimativa total - taxas - frete. Somado
      // por subconsulta e não por join: `pedido_item` é 1:N e juntá-lo aqui
      // multiplicaria o cabeçalho do pedido pelo número de itens, inflando
      // faturamento e ticket médio.
      liquidoTotal: sql<string>`coalesce(sum(${LIQUIDO_DO_PEDIDO}) filter (where ${faturavel}), 0)`,
      liquidoEstimadosQtd: sql<number>`count(*) filter (where ${faturavel} and ${pedido.canal} in ('shopee', 'tiktokshop') and ${pedido.valorLiquido} is null)`,
      repasseApuradoTikTok: sql<string>`coalesce(sum(${pedido.valorLiquido}) filter (where ${pedido.canal} = 'tiktokshop'), 0)`,
      repassePendenteTikTokQtd: sql<number>`count(*) filter (where ${faturavel} and ${pedido.canal} = 'tiktokshop' and ${pedido.valorLiquido} is null)`,
    })
    .from(pedido)
    .innerJoin(cliente, eq(cliente.id, pedido.clienteId))
    .where(and(...filtrosConsulta(orgId, opts)));

  const totalPedidos = Number(resumo?.totalPedidos ?? 0);
  const faturamento = Number(resumo?.faturamento ?? 0);
  const cancelados = Number(resumo?.cancelados ?? 0);
  const canceladosValor = Number(resumo?.canceladosValor ?? 0);
  const devolvidosValor = Number(resumo?.devolvidosValor ?? 0);
  const reembolsosParciaisValor = Number(resumo?.reembolsosParciaisValor ?? 0);

  let shopeePagos: { valor: number; quantidade: number } | undefined;
  if (opts.canais?.length === 1 && opts.canais[0] === "shopee") {
    // Não reutilizar o recorte de criação: um pedido pode ser pago no mês seguinte.
    const filtrosPagos = filtrosConsulta(orgId, { ...opts, inicio: undefined, fim: undefined });
    const dataPagamento = dataPagamentoShopeeSql();
    filtrosPagos.push(sql`${dataPagamento} is not null`);
    if (opts.inicio) filtrosPagos.push(gte(dataPagamento, opts.inicio.toISOString()));
    if (opts.fim) filtrosPagos.push(lte(dataPagamento, opts.fim.toISOString()));
    const [pagos] = await db.select({
      quantidade: count(),
      valor: sql<string>`coalesce(sum(${valorProdutosShopeeSql()}), 0)`,
    }).from(pedido).innerJoin(cliente, eq(cliente.id, pedido.clienteId)).where(and(...filtrosPagos));
    shopeePagos = { valor: Number(pagos?.valor ?? 0), quantidade: Number(pagos?.quantidade ?? 0) };
  }

  return {
    shopeePagos,
    canceladosOperacionais: Number(resumo?.canceladosOperacionais ?? 0),
    canceladosSemPagamento: Number(resumo?.canceladosSemPagamento ?? 0),
    canceladosPagamentoDesconhecido: Number(resumo?.canceladosPagamentoDesconhecido ?? 0),
    canceladosSemPagamentoValor: Number(resumo?.canceladosSemPagamentoValor ?? 0),
    canceladosPagosShopee: Number(resumo?.canceladosPagosShopee ?? 0),
    canceladosSemPagamentoShopee: Number(resumo?.canceladosSemPagamentoShopee ?? 0),
    canceladosSemPagamentoValorShopee: Number(resumo?.canceladosSemPagamentoValorShopee ?? 0),
    totalPedidos,
    faturamento,
    ticketMedio: Number(resumo?.ticketMedio ?? 0),
    cancelados,
    canceladosQtd: Number(resumo?.canceladosQtd ?? 0),
    canceladosValor,
    devolvidosQtd: Number(resumo?.devolvidosQtd ?? 0),
    devolvidosValor,
    reembolsosParciaisQtd: Number(resumo?.reembolsosParciaisQtd ?? 0),
    reembolsosParciaisValor,
    totalBrutoPedidos: Number(resumo?.totalBrutoPedidos ?? 0),
    totalBrutoComparavel: Number(resumo?.totalBrutoComparavel ?? 0),
    pendentesQtd: Number(resumo?.pendentesQtd ?? 0),
    pendentesValor: Number(resumo?.pendentesValor ?? 0),
    liquidoTotal: Number(resumo?.liquidoTotal ?? 0),
    liquidoEstimadosQtd: Number(resumo?.liquidoEstimadosQtd ?? 0),
    repasseApuradoTikTok: Number(resumo?.repasseApuradoTikTok ?? 0),
    repassePendenteTikTokQtd: Number(resumo?.repassePendenteTikTokQtd ?? 0),
  };
}

/** O offset escrito na API não define o calendário das vendas.
 * Os relatórios horários de 04/09 confirmaram aprovação em Brasília. */
export const DESLOCAMENTO_DIA_MERCADOLIVRE_MS = 0;

/** Contrato legado; os relatórios não sustentam o deslocamento de uma hora. */
export async function consultarPedidosNoLimiteDoDia(
  _orgId: string,
  _opts: ConsultaPedidos,
): Promise<{ soNoMercadoLivre: PedidoNoLimite[]; soAqui: PedidoNoLimite[] }> {
  void _orgId;
  void _opts;
  // Compatibilidade com consumidores antigos; não atribuir valores a uma
  // diferença de fuso que o relatório oficial não demonstra.
  return { soNoMercadoLivre: [], soAqui: [] };
}

export interface PedidoNoLimite {
  id: string;
  providerOrderId: string | null;
  clienteNome: string;
  status: string;
  total: number;
  pagamentoAprovado: boolean;
  createdAt: Date;
}

export function consultarPedidosPorMarca(orgId: string, canais?: string[]) {
  const filtros: SQL[] = [eq(pedido.orgId, orgId)];
  if (canais?.length) filtros.push(inArray(pedido.canal, canais));
  return db
    .select({ brandId: brand.id, nome: brand.name, slug: brand.slug, total: sql<number>`count(${pedido.id})` })
    .from(brand)
    .leftJoin(pedido, and(eq(pedido.brandId, brand.id), ...filtros))
    .where(and(eq(brand.orgId, orgId), eq(brand.active, true)))
    .groupBy(brand.id, brand.name, brand.slug)
    .then((linhas) => linhas
      .map((linha) => ({ ...linha, total: Number(linha.total) }))
      .sort(compararPorOrdemDeMarca));
}

export async function consultarPedidosPorCanal(orgId: string, brandIds?: string[]) {
  const contas = await db
    .select({ tipo: channelAccount.tipo, status: channelAccount.status })
    .from(channelAccount)
    .where(eq(channelAccount.orgId, orgId));
  const conectadoPorTipo = new Map<string, boolean>();
  for (const conta of contas) {
    if (conta.status === "conectado") conectadoPorTipo.set(conta.tipo, true);
    else if (!conectadoPorTipo.has(conta.tipo)) conectadoPorTipo.set(conta.tipo, false);
  }

  const filtros: SQL[] = [eq(pedido.orgId, orgId)];
  if (brandIds?.length) filtros.push(inArray(pedido.brandId, brandIds));
  const contagens = await db
    .select({ canal: pedido.canal, total: count() })
    .from(pedido)
    .where(and(...filtros))
    .groupBy(pedido.canal);
  const totalPorCanal = new Map(contagens.map((linha) => [linha.canal, Number(linha.total)]));

  return CANAIS_VENDA.map((tipo) => ({
    tipo,
    conectado: conectadoPorTipo.get(tipo) ?? false,
    total: totalPorCanal.get(tipo) ?? 0,
  }));
}
