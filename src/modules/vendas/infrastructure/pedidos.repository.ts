import { and, count, desc, eq, gte, ilike, inArray, lte, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/shared/lib/db";
import { brand, channelAccount, cliente, pedido, pedidoItem } from "@/shared/lib/db/schema";
import { compararPorOrdemDeMarca } from "@/shared/config/brands";
import { CANAIS_VENDA, type ConsultaPedidos } from "../domain/consulta-pedidos";
import { STATUS_PEDIDO_FATURAVEL } from "../domain/status-faturamento";
import {
  pagamentoAprovadoPedidoSql,
  dataVendaPedidoSql,
  pedidoComercialSql,
  reembolsoParcialPedidoSql,
  valorFaturavelPedidoSql,
} from "./valor-faturamento.sql";

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
const VALOR_FATURAVEL_DO_PEDIDO = valorFaturavelPedidoSql();
const REEMBOLSO_PARCIAL_DO_PEDIDO = reembolsoParcialPedidoSql();
const PAGAMENTO_APROVADO_DO_PEDIDO = pagamentoAprovadoPedidoSql();

/** Repasse do pedido. `valor_liquido` é o número que o canal informou (escrow
 *  da Shopee) e vale mais que qualquer reconstrução nossa: já traz subsídio de
 *  frete, tarifa de campanha e ajustes que a estimativa não enxerga. Para quem
 *  não informa (Mercado Livre, canais manuais), sobra a estimativa. */
const LIQUIDO_DO_PEDIDO = sql`coalesce(
  ${pedido.valorLiquido},
  ${VALOR_FATURAVEL_DO_PEDIDO} - ${TAXA_DO_PEDIDO} - coalesce(${pedido.frete}, 0)
)`;

export async function consultarResumoPedidos(orgId: string, opts: ConsultaPedidos) {
  const faturavel = inArray(pedido.status, [...STATUS_PEDIDO_FATURAVEL]);
  const canceladoFinanceiro = sql`${pedido.status} = 'cancelado' and ${PAGAMENTO_APROVADO_DO_PEDIDO}`;
  const devolvidoFinanceiro = sql`${pedido.status} = 'devolvido' and ${PAGAMENTO_APROVADO_DO_PEDIDO}`;
  const ajusteIntegralFinanceiro = sql`(${canceladoFinanceiro} or ${devolvidoFinanceiro})`;
  const [resumo] = await db
    .select({
      // Mesmo recorte do faturamento (somente pagamento confirmado): os dois
      // cards ficam lado a lado na tela, e contar aqui os cancelados que o
      // faturamento não conta fazia os números não fecharem entre si — quem
      // dividisse um pelo outro pra achar o ticket médio erraria. Cancelado e
      // devolvido já têm cards próprios ao lado, com quantidade e valor.
      totalPedidos: sql<number>`count(*) filter (where ${faturavel})`,
      faturamento: sql<string>`coalesce(sum(${VALOR_FATURAVEL_DO_PEDIDO}) filter (where ${faturavel}), 0)`,
      ticketMedio: sql<string>`coalesce(avg(${VALOR_FATURAVEL_DO_PEDIDO}) filter (where ${faturavel}), 0)`,
      cancelados: sql<number>`count(*) filter (where ${ajusteIntegralFinanceiro})`,
      canceladosQtd: sql<number>`count(*) filter (where ${canceladoFinanceiro})`,
      canceladosValor: sql<string>`coalesce(sum(${pedido.total}) filter (where ${canceladoFinanceiro}), 0)`,
      devolvidosQtd: sql<number>`count(*) filter (where ${devolvidoFinanceiro})`,
      devolvidosValor: sql<string>`coalesce(sum(${pedido.total}) filter (where ${devolvidoFinanceiro}), 0)`,
      reembolsosParciaisQtd: sql<number>`count(*) filter (where ${faturavel} and ${REEMBOLSO_PARCIAL_DO_PEDIDO} > 0)`,
      reembolsosParciaisValor: sql<string>`coalesce(sum(${REEMBOLSO_PARCIAL_DO_PEDIDO}) filter (where ${faturavel}), 0)`,
      // Mesma regra do detalhe do pedido e de Métricas: o repasse informado
      // pelo canal manda; sem ele, a estimativa total - taxas - frete. Somado
      // por subconsulta e não por join: `pedido_item` é 1:N e juntá-lo aqui
      // multiplicaria o cabeçalho do pedido pelo número de itens, inflando
      // faturamento e ticket médio.
      liquidoTotal: sql<string>`coalesce(sum(${LIQUIDO_DO_PEDIDO}) filter (where ${faturavel}), 0)`,
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

  return {
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
    totalBrutoPedidos: totalPedidos + cancelados,
    totalBrutoComparavel: faturamento + canceladosValor + devolvidosValor + reembolsosParciaisValor,
    liquidoTotal: Number(resumo?.liquidoTotal ?? 0),
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
