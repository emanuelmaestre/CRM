import { and, count, desc, eq, gt, gte, ilike, inArray, lt, lte, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/shared/lib/db";
import { brand, channelAccount, cliente, pedido, pedidoItem } from "@/shared/lib/db/schema";
import { compararPorOrdemDeMarca } from "@/shared/config/brands";
import { CANAIS_VENDA, type ConsultaPedidos } from "../domain/consulta-pedidos";

function filtrosConsulta(orgId: string, opts: ConsultaPedidos): SQL[] {
  const filtros: SQL[] = [eq(pedido.orgId, orgId)];
  if (opts.brandIds?.length) filtros.push(inArray(pedido.brandId, opts.brandIds));
  if (opts.canais?.length) filtros.push(inArray(pedido.canal, opts.canais));
  if (opts.statuses?.length) filtros.push(inArray(pedido.status, opts.statuses));
  if (opts.inicio) filtros.push(gte(pedido.createdAt, opts.inicio));
  if (opts.fim) filtros.push(lte(pedido.createdAt, opts.fim));
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
        createdAt: pedido.createdAt,
        quantidadeItens: sql<number>`coalesce((select sum(${pedidoItem.quantidade}) from ${pedidoItem} where ${pedidoItem.pedidoId} = ${pedido.id}), 0)`,
      })
      .from(pedido)
      .innerJoin(cliente, eq(cliente.id, pedido.clienteId))
      .innerJoin(brand, eq(brand.id, pedido.brandId))
      .where(and(...filtros))
      .orderBy(desc(pedido.createdAt))
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

/** Repasse do pedido. `valor_liquido` é o número que o canal informou (escrow
 *  da Shopee) e vale mais que qualquer reconstrução nossa: já traz subsídio de
 *  frete, tarifa de campanha e ajustes que a estimativa não enxerga. Para quem
 *  não informa (Mercado Livre, canais manuais), sobra a estimativa. */
const LIQUIDO_DO_PEDIDO = sql`coalesce(
  ${pedido.valorLiquido},
  ${pedido.total} - ${TAXA_DO_PEDIDO} - coalesce(${pedido.frete}, 0)
)`;

export async function consultarResumoPedidos(orgId: string, opts: ConsultaPedidos) {
  const [resumo] = await db
    .select({
      // Mesmo recorte do faturamento (exclui cancelado/devolvido): os dois
      // cards ficam lado a lado na tela, e contar aqui os cancelados que o
      // faturamento não conta fazia os números não fecharem entre si — quem
      // dividisse um pelo outro pra achar o ticket médio erraria. Cancelado e
      // devolvido já têm cards próprios ao lado, com quantidade e valor.
      totalPedidos: sql<number>`count(*) filter (where ${pedido.status} not in ('cancelado', 'devolvido'))`,
      faturamento: sql<string>`coalesce(sum(${pedido.total}) filter (where ${pedido.status} not in ('cancelado', 'devolvido')), 0)`,
      ticketMedio: sql<string>`coalesce(avg(${pedido.total}) filter (where ${pedido.status} not in ('cancelado', 'devolvido')), 0)`,
      cancelados: sql<number>`count(*) filter (where ${pedido.status} in ('cancelado', 'devolvido'))`,
      canceladosQtd: sql<number>`count(*) filter (where ${pedido.status} = 'cancelado')`,
      canceladosValor: sql<string>`coalesce(sum(${pedido.total}) filter (where ${pedido.status} = 'cancelado'), 0)`,
      devolvidosQtd: sql<number>`count(*) filter (where ${pedido.status} = 'devolvido')`,
      devolvidosValor: sql<string>`coalesce(sum(${pedido.total}) filter (where ${pedido.status} = 'devolvido'), 0)`,
      // Mesma regra do detalhe do pedido e de Métricas: o repasse informado
      // pelo canal manda; sem ele, a estimativa total - taxas - frete. Somado
      // por subconsulta e não por join: `pedido_item` é 1:N e juntá-lo aqui
      // multiplicaria o cabeçalho do pedido pelo número de itens, inflando
      // faturamento e ticket médio.
      liquidoTotal: sql<string>`coalesce(sum(${LIQUIDO_DO_PEDIDO}) filter (where ${pedido.status} not in ('cancelado', 'devolvido')), 0)`,
    })
    .from(pedido)
    .innerJoin(cliente, eq(cliente.id, pedido.clienteId))
    .where(and(...filtrosConsulta(orgId, opts)));

  return {
    totalPedidos: Number(resumo?.totalPedidos ?? 0),
    faturamento: Number(resumo?.faturamento ?? 0),
    ticketMedio: Number(resumo?.ticketMedio ?? 0),
    cancelados: Number(resumo?.cancelados ?? 0),
    canceladosQtd: Number(resumo?.canceladosQtd ?? 0),
    canceladosValor: Number(resumo?.canceladosValor ?? 0),
    devolvidosQtd: Number(resumo?.devolvidosQtd ?? 0),
    devolvidosValor: Number(resumo?.devolvidosValor ?? 0),
    liquidoTotal: Number(resumo?.liquidoTotal ?? 0),
  };
}

/** A hora em que o dia do Mercado Livre e o dia daqui não coincidem.
 *
 *  O relógio do ML corre em GMT-4: o `date_created` que a API devolve vem
 *  escrito nesse fuso ("2026-08-26T23:10:15.000-04:00") e o painel de métricas
 *  dele fecha o dia por esse relógio. O CRM guarda o instante certo e fecha o
 *  dia em Brasília (GMT-3). O resultado é uma hora de desencontro em cada
 *  ponta do período — e nenhum pedido perdido, só deslocado de dia. */
export const DESLOCAMENTO_DIA_MERCADOLIVRE_MS = 60 * 60 * 1000;

/** Os pedidos que caem na fronteira entre os dois calendários.
 *
 *  `soNoMercadoLivre` — vendidos na primeira hora depois do fim do período: o
 *  Mercado Livre os conta dentro do período escolhido, aqui eles aparecem no
 *  dia seguinte. É o que faz o total do CRM ficar ABAIXO do painel dele.
 *
 *  `soAqui` — vendidos na primeira hora do dia de início: aqui entram no
 *  período, e o Mercado Livre os joga para o dia anterior, fazendo o total
 *  ficar ACIMA. Quase sempre vazio (venda entre meia-noite e uma da manhã é
 *  rara), mas sem ele a conferência não fecha nos dois sentidos.
 *
 *  Os limites são abertos de um lado de propósito: o dia do ML termina em
 *  01:00 EXATO no relógio daqui, então um pedido de 01:00:00 já é do dia
 *  seguinte para os dois calendários e não está em desencontro nenhum. */
export async function consultarPedidosNoLimiteDoDia(
  orgId: string,
  opts: ConsultaPedidos,
): Promise<{ soNoMercadoLivre: PedidoNoLimite[]; soAqui: PedidoNoLimite[] }> {
  const vazio = { soNoMercadoLivre: [], soAqui: [] };
  // Sem recorte de data não existe fronteira de dia para desencontrar. E se o
  // filtro de canal exclui o Mercado Livre, o desencontro não se aplica a
  // nada do que está na tela.
  if (!opts.inicio || !opts.fim) return vazio;
  if (opts.canais?.length && !opts.canais.includes("mercadolivre")) return vazio;

  const janela = (...limites: SQL[]) => db
    .select({
      id: pedido.id,
      providerOrderId: pedido.providerOrderId,
      clienteNome: cliente.nome,
      status: pedido.status,
      total: pedido.total,
      createdAt: pedido.createdAt,
    })
    .from(pedido)
    .innerJoin(cliente, eq(cliente.id, pedido.clienteId))
    .where(and(
      eq(pedido.orgId, orgId),
      eq(pedido.canal, "mercadolivre"),
      ...(opts.brandIds?.length ? [inArray(pedido.brandId, opts.brandIds)] : []),
      ...limites,
    ))
    .orderBy(pedido.createdAt);

  const [soNoMercadoLivre, soAqui] = await Promise.all([
    janela(
      gt(pedido.createdAt, opts.fim),
      lte(pedido.createdAt, new Date(opts.fim.getTime() + DESLOCAMENTO_DIA_MERCADOLIVRE_MS)),
    ),
    janela(
      gte(pedido.createdAt, opts.inicio),
      lt(pedido.createdAt, new Date(opts.inicio.getTime() + DESLOCAMENTO_DIA_MERCADOLIVRE_MS)),
    ),
  ]);

  const normalizar = (linhas: Awaited<ReturnType<typeof janela>>): PedidoNoLimite[] =>
    linhas.map((linha) => ({ ...linha, total: Number(linha.total) }));

  return { soNoMercadoLivre: normalizar(soNoMercadoLivre), soAqui: normalizar(soAqui) };
}

export interface PedidoNoLimite {
  id: string;
  providerOrderId: string | null;
  clienteNome: string;
  status: string;
  total: number;
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
