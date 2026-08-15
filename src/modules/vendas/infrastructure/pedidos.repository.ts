import { and, asc, count, desc, eq, gte, ilike, inArray, lte, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/shared/lib/db";
import { brand, channelAccount, cliente, pedido } from "@/shared/lib/db/schema";
import { CANAIS_VENDA, type ConsultaPedidos } from "../domain/consulta-pedidos";

function filtrosConsulta(orgId: string, opts: ConsultaPedidos): SQL[] {
  const filtros: SQL[] = [eq(pedido.orgId, orgId)];
  if (opts.brandIds?.length) filtros.push(inArray(pedido.brandId, opts.brandIds));
  if (opts.canal) filtros.push(eq(pedido.canal, opts.canal));
  if (opts.status) filtros.push(eq(pedido.status, opts.status));
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

export async function consultarResumoPedidos(orgId: string, opts: ConsultaPedidos) {
  const [resumo] = await db
    .select({
      totalPedidos: count(),
      faturamento: sql<string>`coalesce(sum(${pedido.total}) filter (where ${pedido.status} not in ('cancelado', 'devolvido')), 0)`,
      ticketMedio: sql<string>`coalesce(avg(${pedido.total}) filter (where ${pedido.status} not in ('cancelado', 'devolvido')), 0)`,
      cancelados: sql<number>`count(*) filter (where ${pedido.status} in ('cancelado', 'devolvido'))`,
      freteTotal: sql<string>`coalesce(sum(${pedido.frete}) filter (where ${pedido.status} not in ('cancelado', 'devolvido')), 0)`,
      descontosTotal: sql<string>`coalesce(sum(${pedido.desconto}) filter (where ${pedido.status} not in ('cancelado', 'devolvido')), 0)`,
    })
    .from(pedido)
    .innerJoin(cliente, eq(cliente.id, pedido.clienteId))
    .where(and(...filtrosConsulta(orgId, opts)));

  return {
    totalPedidos: Number(resumo?.totalPedidos ?? 0),
    faturamento: Number(resumo?.faturamento ?? 0),
    ticketMedio: Number(resumo?.ticketMedio ?? 0),
    cancelados: Number(resumo?.cancelados ?? 0),
    freteTotal: Number(resumo?.freteTotal ?? 0),
    descontosTotal: Number(resumo?.descontosTotal ?? 0),
  };
}

export function consultarPedidosPorMarca(orgId: string, canal?: string) {
  const filtros: SQL[] = [eq(pedido.orgId, orgId)];
  if (canal) filtros.push(eq(pedido.canal, canal));
  return db
    .select({ brandId: brand.id, nome: brand.name, slug: brand.slug, total: sql<number>`count(${pedido.id})` })
    .from(brand)
    .leftJoin(pedido, and(eq(pedido.brandId, brand.id), ...filtros))
    .where(and(eq(brand.orgId, orgId), eq(brand.active, true)))
    .groupBy(brand.id, brand.name, brand.slug)
    .orderBy(desc(sql`count(${pedido.id})`), asc(brand.name))
    .then((linhas) => linhas.map((linha) => ({ ...linha, total: Number(linha.total) })));
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
