import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { CrudContext } from "@/shared/lib/crud-factory";
import { pedido } from "@/shared/lib/db/schema";

/* ── Três indicadores que já moravam no banco ─────────────────────
   Nenhum dos três pede chamada nova a canal nenhum. Toda métrica de
   faturamento do módulo já filtra `cancelado`/`devolvido` para fora —
   esse descarte nunca virou número próprio. O Painel já sabe quais
   produtos mais vendem, mas nunca perguntou "quanto da receita depende
   só deles". E o Scoring já classifica cliente novo vs. recorrente,
   só que só o módulo de Scoring lê essa tabela. */

export interface CrescimentoMarca {
  brandId: string;
  /** 0–100: fração dos pedidos do período que foi cancelada ou devolvida. */
  taxaCancelamento: number | null;
  totalPedidosBrutos: number;
  /** 0–100: quanto da receita (não cancelada) veio dos 5 produtos mais
   *  vendidos da marca no período. Alto = a marca depende de poucos itens. */
  concentracaoTop5: number | null;
  /** 0–100: quanto da receita (não cancelada) veio de cliente que já tinha
   *  comprado dessa marca antes do período. Null sem receita no período. */
  taxaRecorrencia: number | null;
}

function paraNumero(valor: unknown): number {
  const parsed = Number(valor ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function percentual(parte: number, total: number): number | null {
  return total > 0 ? Math.round((parte / total) * 1000) / 10 : null;
}

/** Cancelamento e devolução contam sobre TODOS os pedidos do período — ao
 *  contrário do resto do módulo, aqui é exatamente o que se quer medir, não
 *  o que se quer excluir. */
async function taxasCancelamento(
  ctx: CrudContext,
  inicio: Date,
  fim: Date,
  brandIds: string[],
): Promise<Map<string, { taxa: number | null; total: number }>> {
  const linhas = await ctx.db
    .select({
      brandId: pedido.brandId,
      total: sql<number>`count(*)`,
      cancelados: sql<number>`count(*) filter (where ${pedido.status} in ('cancelado', 'devolvido'))`,
    })
    .from(pedido)
    .where(and(
      eq(pedido.orgId, ctx.orgId),
      inArray(pedido.brandId, brandIds),
      gte(pedido.createdAt, inicio),
      lte(pedido.createdAt, fim),
    ))
    .groupBy(pedido.brandId);

  return new Map(linhas.map((linha) => {
    const total = paraNumero(linha.total);
    const cancelados = paraNumero(linha.cancelados);
    return [linha.brandId, { taxa: percentual(cancelados, total), total }];
  }));
}

/** Top 5 por receita, dentro de cada marca — window function faz o ranking
 *  no próprio banco, sem trazer todo o catálogo pra somar em JS. */
async function concentracaoTop5PorMarca(
  ctx: CrudContext,
  inicio: Date,
  fim: Date,
  brandIds: string[],
): Promise<Map<string, number | null>> {
  const resultado = await ctx.db.execute(sql`
    with vendas_produto as (
      select p.brand_id, pi.produto_id, sum(pi.quantidade * pi.preco_unitario) as receita
      from pedido_item pi
      inner join pedido p on p.id = pi.pedido_id
      where p.org_id = ${ctx.orgId}
        and p.brand_id in (${sql.join(brandIds.map((id) => sql`${id}::uuid`), sql`, `)})
        and p.criado_em >= ${inicio.toISOString()}::timestamptz
        and p.criado_em <= ${fim.toISOString()}::timestamptz
        and p.status not in ('cancelado', 'devolvido')
      group by p.brand_id, pi.produto_id
    ),
    ranqueado as (
      select *, row_number() over (partition by brand_id order by receita desc) as posicao
      from vendas_produto
    )
    select
      brand_id,
      sum(receita) as receita_total,
      sum(receita) filter (where posicao <= 5) as receita_top5
    from ranqueado
    group by brand_id
  `);

  const linhas = (Array.isArray(resultado) ? resultado : (resultado as { rows?: unknown[] }).rows) ?? [];
  const mapa = new Map<string, number | null>();
  for (const linha of linhas as Array<Record<string, unknown>>) {
    const total = paraNumero(linha.receita_total);
    const top5 = paraNumero(linha.receita_top5);
    mapa.set(String(linha.brand_id), percentual(top5, total));
  }
  return mapa;
}

/** "Recorrente" = o cliente já tinha um pedido não-cancelado dessa mesma
 *  marca antes deste. Escopo por marca, não pela org inteira: cliente é
 *  compartilhado entre marcas no cadastro, mas comprar da KARZI antes não
 *  faz alguém "cliente recorrente" da WUWU na primeira compra de lá. */
async function taxaRecorrenciaPorMarca(
  ctx: CrudContext,
  inicio: Date,
  fim: Date,
  brandIds: string[],
): Promise<Map<string, number | null>> {
  const resultado = await ctx.db.execute(sql`
    with pedidos_do_periodo as (
      select
        p.brand_id,
        p.total,
        exists (
          select 1 from pedido anterior
          where anterior.cliente_id = p.cliente_id
            and anterior.brand_id = p.brand_id
            and anterior.org_id = p.org_id
            and anterior.criado_em < p.criado_em
            and anterior.status not in ('cancelado', 'devolvido')
        ) as recorrente
      from pedido p
      where p.org_id = ${ctx.orgId}
        and p.brand_id in (${sql.join(brandIds.map((id) => sql`${id}::uuid`), sql`, `)})
        and p.criado_em >= ${inicio.toISOString()}::timestamptz
        and p.criado_em <= ${fim.toISOString()}::timestamptz
        and p.status not in ('cancelado', 'devolvido')
    )
    select
      brand_id,
      sum(total) as receita_total,
      sum(total) filter (where recorrente) as receita_recorrente
    from pedidos_do_periodo
    group by brand_id
  `);

  const linhas = (Array.isArray(resultado) ? resultado : (resultado as { rows?: unknown[] }).rows) ?? [];
  const mapa = new Map<string, number | null>();
  for (const linha of linhas as Array<Record<string, unknown>>) {
    const total = paraNumero(linha.receita_total);
    const recorrente = paraNumero(linha.receita_recorrente);
    mapa.set(String(linha.brand_id), percentual(recorrente, total));
  }
  return mapa;
}

export async function obterCrescimentoPorMarca(
  ctx: CrudContext,
  opcoes: { inicio: Date; fim: Date; brandIds: string[] },
): Promise<Map<string, CrescimentoMarca>> {
  if (opcoes.brandIds.length === 0) return new Map();

  const [cancelamento, concentracao, recorrencia] = await Promise.all([
    taxasCancelamento(ctx, opcoes.inicio, opcoes.fim, opcoes.brandIds),
    concentracaoTop5PorMarca(ctx, opcoes.inicio, opcoes.fim, opcoes.brandIds),
    taxaRecorrenciaPorMarca(ctx, opcoes.inicio, opcoes.fim, opcoes.brandIds),
  ]);

  const resultado = new Map<string, CrescimentoMarca>();
  for (const brandId of opcoes.brandIds) {
    const cancel = cancelamento.get(brandId);
    resultado.set(brandId, {
      brandId,
      taxaCancelamento: cancel?.taxa ?? null,
      totalPedidosBrutos: cancel?.total ?? 0,
      concentracaoTop5: concentracao.get(brandId) ?? null,
      taxaRecorrencia: recorrencia.get(brandId) ?? null,
    });
  }
  return resultado;
}
