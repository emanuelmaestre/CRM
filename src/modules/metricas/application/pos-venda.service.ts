import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { CrudContext } from "@/shared/lib/crud-factory";
import { brand, pedido } from "@/shared/lib/db/schema";
import { getBrandConfig } from "@/shared/config/brands";

export interface PosVendaMarca {
  brandId: string;
  marcaSlug: string;
  marcaLabel: string;
  total: number;
  cancelados: number;
  devolvidos: number;
  entregues: number;
  emTransito: number;
  taxaProblemas: number | null;
  impactoFinanceiro: number;
  principaisMotivos: Array<{ motivo: string; quantidade: number }>;
}

export interface PosVendaResultado { marcas: PosVendaMarca[]; parcial: boolean }

const numero = (valor: unknown) => Number.isFinite(Number(valor)) ? Number(valor) : 0;

/** Leitura operacional a partir dos pedidos já ingeridos. Prazo real de
 * despacho/entrega não existe no schema atual, por isso `parcial` deixa essa
 * limitação explícita em vez de fabricar um SLA. */
export async function obterPosVenda(ctx: CrudContext, filtros: {
  inicio: Date; fim: Date; brandIds?: string[];
}): Promise<PosVendaResultado> {
  const marcas = await ctx.db.select({ id: brand.id, slug: brand.slug, nome: brand.name })
    .from(brand)
    .where(and(eq(brand.orgId, ctx.orgId), eq(brand.active, true),
      ...(filtros.brandIds?.length ? [inArray(brand.id, filtros.brandIds)] : [])));
  if (marcas.length === 0) return { marcas: [], parcial: true };

  const ids = marcas.map((item) => item.id);
  const [resumos, motivos] = await Promise.all([
    ctx.db.select({
      brandId: pedido.brandId,
      total: sql<number>`count(*)`,
      cancelados: sql<number>`count(*) filter (where ${pedido.status} = 'cancelado')`,
      devolvidos: sql<number>`count(*) filter (where ${pedido.status} = 'devolvido')`,
      entregues: sql<number>`count(*) filter (where ${pedido.status} in ('entregue','concluido','avaliacao_solicitada'))`,
      emTransito: sql<number>`count(*) filter (where ${pedido.status} in ('pago','separado','enviado'))`,
      impacto: sql<number>`coalesce(sum(${pedido.total}) filter (where ${pedido.status} in ('cancelado','devolvido')), 0)`,
    }).from(pedido).where(and(eq(pedido.orgId, ctx.orgId), inArray(pedido.brandId, ids),
      gte(pedido.createdAt, filtros.inicio), lte(pedido.createdAt, filtros.fim))).groupBy(pedido.brandId),
    ctx.db.select({ brandId: pedido.brandId, motivo: pedido.canceladoMotivo, quantidade: sql<number>`count(*)` })
      .from(pedido).where(and(eq(pedido.orgId, ctx.orgId), inArray(pedido.brandId, ids),
        gte(pedido.createdAt, filtros.inicio), lte(pedido.createdAt, filtros.fim),
        inArray(pedido.status, ["cancelado", "devolvido"])))
      .groupBy(pedido.brandId, pedido.canceladoMotivo),
  ]);
  const porMarca = new Map(resumos.map((item) => [item.brandId, item]));
  return {
    parcial: true,
    marcas: marcas.map((marca) => {
      const item = porMarca.get(marca.id);
      const total = numero(item?.total);
      const cancelados = numero(item?.cancelados);
      const devolvidos = numero(item?.devolvidos);
      return {
        brandId: marca.id,
        marcaSlug: marca.slug,
        marcaLabel: getBrandConfig(marca.slug)?.label ?? marca.nome,
        total, cancelados, devolvidos,
        entregues: numero(item?.entregues), emTransito: numero(item?.emTransito),
        taxaProblemas: total > 0 ? Math.round(((cancelados + devolvidos) / total) * 1000) / 10 : null,
        impactoFinanceiro: numero(item?.impacto),
        principaisMotivos: motivos.filter((m) => m.brandId === marca.id)
          .map((m) => ({ motivo: m.motivo?.trim() || "Motivo não informado", quantidade: numero(m.quantidade) }))
          .sort((a, b) => b.quantidade - a.quantidade).slice(0, 3),
      };
    }),
  };
}
