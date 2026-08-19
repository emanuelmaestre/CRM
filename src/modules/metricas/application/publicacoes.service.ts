import { and, desc, eq, gte, inArray, lte, max, ne, sql, sum } from "drizzle-orm";
import type { CrudContext } from "@/shared/lib/crud-factory";
import { adsAnuncioSnapshot, brand, pedido, pedidoItem } from "@/shared/lib/db/schema";
import { criarMLProvider } from "@/modules/canais/infrastructure/mercadolivre.provider";
import { isBrandSlug } from "@/shared/config/brands";

export interface DesempenhoPublicacao {
  itemId: string;
  titulo: string;
  visitas: number;
  unidadesVendidas: number;
  conversaoEstimada: number | null;
  investimento: number;
  receita: number;
  qualidade: number | null;
  nivelQualidade: string | null;
  pendencias: string[];
}

export interface DesempenhoPublicacoesResultado {
  itens: DesempenhoPublicacao[];
  parcial: boolean;
  periodo: { inicio: string; fim: string };
}

function numero(valor: unknown): number {
  const resultado = Number(valor ?? 0);
  return Number.isFinite(resultado) ? resultado : 0;
}

export async function obterDesempenhoPublicacoes(
  ctx: CrudContext,
  filtros: { brandId: string; inicio: string; fim: string },
): Promise<DesempenhoPublicacoesResultado> {
  const marca = await ctx.db.select({ slug: brand.slug }).from(brand).where(and(
    eq(brand.orgId, ctx.orgId), eq(brand.id, filtros.brandId), eq(brand.active, true),
  )).then((rows) => rows[0]);
  if (!marca || !isBrandSlug(marca.slug)) return { itens: [], parcial: false, periodo: filtros };

  const ultimaData = await ctx.db.select({ data: adsAnuncioSnapshot.data }).from(adsAnuncioSnapshot)
    .where(and(eq(adsAnuncioSnapshot.orgId, ctx.orgId), eq(adsAnuncioSnapshot.brandId, filtros.brandId)))
    .orderBy(desc(adsAnuncioSnapshot.data)).limit(1).then((rows) => rows[0]?.data ?? null);
  if (!ultimaData) return { itens: [], parcial: false, periodo: filtros };

  // Um item pode estar em mais de uma campanha no mesmo dia (chave única é
  // orgId+conta+campanha+item+data, não item+data) — agrega por itemId para
  // não duplicar a publicação na tela somando o desempenho das campanhas.
  const anuncios = await ctx.db.select({
    itemId: adsAnuncioSnapshot.itemId,
    titulo: max(adsAnuncioSnapshot.titulo),
    vendas: sum(adsAnuncioSnapshot.unitsQuantity),
    investimento: sum(adsAnuncioSnapshot.cost),
    receita: sum(adsAnuncioSnapshot.totalAmount),
    produtoId: sql<string | null>`max(${adsAnuncioSnapshot.produtoId}::text)`,
  }).from(adsAnuncioSnapshot).where(and(
    eq(adsAnuncioSnapshot.orgId, ctx.orgId),
    eq(adsAnuncioSnapshot.brandId, filtros.brandId),
    eq(adsAnuncioSnapshot.data, ultimaData),
  )).groupBy(adsAnuncioSnapshot.itemId).orderBy(desc(sql`sum(${adsAnuncioSnapshot.totalAmount})`)).limit(20);

  const provider = await criarMLProvider(marca.slug);
  const ids = anuncios.map((item) => item.itemId);
  const produtoIds = anuncios.map((item) => item.produtoId).filter((id): id is string => Boolean(id));
  const vendasLocais = produtoIds.length === 0 ? [] : await ctx.db.select({
    produtoId: pedidoItem.produtoId,
    quantidade: sum(pedidoItem.quantidade),
  }).from(pedidoItem).innerJoin(pedido, eq(pedido.id, pedidoItem.pedidoId)).where(and(
    eq(pedido.orgId, ctx.orgId),
    inArray(pedidoItem.produtoId, produtoIds),
    gte(pedido.createdAt, new Date(`${filtros.inicio}T00:00:00`)),
    lte(pedido.createdAt, new Date(`${filtros.fim}T23:59:59.999`)),
    ne(pedido.status, "cancelado"), ne(pedido.status, "devolvido"),
  )).groupBy(pedidoItem.produtoId);
  const vendasPorProduto = new Map(vendasLocais.map((item) => [item.produtoId, numero(item.quantidade)]));
  const visitas = await provider.obterVisitasItens(ids, filtros.inicio, filtros.fim);
  const visitasPorItem = new Map(visitas.map((item) => [item.itemId, item.total]));
  const performances = await Promise.allSettled(ids.map((id) => provider.obterPerformanceItem(id)));
  const performancePorItem = new Map(performances.flatMap((item) => item.status === "fulfilled" ? [[item.value.itemId, item.value] as const] : []));

  return {
    periodo: { inicio: filtros.inicio, fim: filtros.fim },
    parcial: performances.some((item) => item.status === "rejected"),
    itens: anuncios.map((anuncio) => {
      const totalVisitas = visitasPorItem.get(anuncio.itemId) ?? 0;
      const vendas = anuncio.produtoId ? vendasPorProduto.get(anuncio.produtoId) ?? 0 : numero(anuncio.vendas);
      const performance = performancePorItem.get(anuncio.itemId);
      return {
        itemId: anuncio.itemId,
        titulo: anuncio.titulo ?? anuncio.itemId,
        visitas: totalVisitas,
        unidadesVendidas: vendas,
        conversaoEstimada: totalVisitas > 0 ? Math.round((vendas / totalVisitas) * 10_000) / 100 : null,
        investimento: numero(anuncio.investimento),
        receita: numero(anuncio.receita),
        qualidade: performance?.score ?? null,
        nivelQualidade: performance?.nivel ?? null,
        pendencias: performance?.pendencias ?? [],
      };
    }),
  };
}
