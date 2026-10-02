import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { CrudContext } from "@/shared/lib/crud-factory";
import { pedido } from "@/shared/lib/db/schema";
import { STATUS_PEDIDO_FATURAVEL } from "@/modules/vendas/domain/status-faturamento";
import { pedidoComercialSql } from "@/modules/vendas/infrastructure/valor-faturamento.sql";
import { composicaoResumoPedidosSql } from "@/modules/vendas/infrastructure/composicao-resumo.sql";
import { referenciaFaturamentoSql } from "@/modules/metricas/infrastructure/faturamento.sql";

const STATUS_PEDIDO_COM_DESFECHO_SQL = sql.join(
  [...STATUS_PEDIDO_FATURAVEL, "cancelado", "devolvido"].map((status) => sql`${status}`),
  sql`, `,
);


/* Indicadores locais: cancelamentos operacionais por criação e receita
   preservada por referência financeira para concentração e recorrência. */

export interface CrescimentoMarca {
  brandId: string;
  /** 0–100: fração dos pedidos do período que foi cancelada ou devolvida. */
  taxaCancelamento: number | null;
  totalPedidosBrutos: number;
  /** Quantos desses pedidos brutos estavam cancelados ou devolvidos — o
   *  numerador exato por trás de `taxaCancelamento`. */
  pedidosCanceladosOuDevolvidos: number;
  /** 0–100: quanto da receita paga veio dos 5 produtos mais
   *  vendidos da marca no período. Alto = a marca depende de poucos itens. */
  concentracaoTop5: number | null;
  /** Receita total paga e a fatia dela que veio dos 5 produtos
   *  mais vendidos — o numerador e o denominador de `concentracaoTop5`. */
  receitaTotalConcentracao: number;
  receitaTop5: number;
  /** 0–100: quanto da receita paga veio de cliente que já tinha
   *  comprado dessa marca antes desta compra. Null sem receita no período. */
  taxaRecorrencia: number | null;
  /** Receita total paga e a fatia dela vinda de clientes
   *  recorrentes — o numerador e o denominador de `taxaRecorrencia`. */
  receitaTotalRecorrencia: number;
  receitaRecorrente: number;
}

function paraNumero(valor: unknown): number {
  const parsed = Number(valor ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function percentual(parte: number, total: number): number | null {
  return total > 0 ? Math.round((parte / total) * 1000) / 10 : null;
}

/** Base financeira comum: pagamento na Shopee/TikTok e aprovação no ML. */
function baseFinanceira(ctx: CrudContext, brandIds: string[], canais: string[]) {
  const r = referenciaFaturamentoSql();
  return sql`select ${pedido.id} as id, ${pedido.brandId} as brand_id,
    ${pedido.clienteId} as cliente_id, ${r.data} as data_venda,
    ${r.confirmado} as receita
    from ${pedido}
    where ${pedido.orgId} = ${ctx.orgId} and ${pedidoComercialSql()}
      and ${r.incluido} and ${r.faturavel}
      and ${pedido.brandId} in (${sql.join(brandIds.map((id) => sql`${id}::uuid`), sql`, `)})
      ${canais.length > 0 ? sql`and ${pedido.canal} in (${sql.join(canais.map((c) => sql`${c}`), sql`, `)})` : sql``}`;
}

/** Cancelamento e devolução contam sobre TODOS os pedidos do período — ao
 *  contrário do resto do módulo, aqui é exatamente o que se quer medir, não
 *  o que se quer excluir. */
async function taxasCancelamento(
  ctx: CrudContext,
  inicio: Date,
  fim: Date,
  brandIds: string[],
  canais: string[],
): Promise<Map<string, { taxa: number | null; total: number; cancelados: number }>> {
  const status = composicaoResumoPedidosSql().status;
  const linhas = await ctx.db
    .select({
      brandId: pedido.brandId,
      total: sql<number>`count(*) filter (where ${status} in (${STATUS_PEDIDO_COM_DESFECHO_SQL}))`,
      cancelados: sql<number>`count(*) filter (where ${status} in ('cancelado', 'devolvido'))`,
    })
    .from(pedido)
    .where(and(
      eq(pedido.orgId, ctx.orgId),
      pedidoComercialSql(),
      inArray(pedido.brandId, brandIds),
      gte(pedido.createdAt, inicio),
      lte(pedido.createdAt, fim),
      ...(canais.length > 0 ? [inArray(pedido.canal, canais)] : []),
    ))
    .groupBy(pedido.brandId);

  return new Map(linhas.map((linha) => {
    const total = paraNumero(linha.total);
    const cancelados = paraNumero(linha.cancelados);
    return [linha.brandId, { taxa: percentual(cancelados, total), total, cancelados }];
  }));
}

/** Top 5 por receita, dentro de cada marca — window function faz o ranking
 *  no próprio banco, sem trazer todo o catálogo pra somar em JS. */
async function concentracaoTop5PorMarca(
  ctx: CrudContext,
  inicio: Date,
  fim: Date,
  brandIds: string[],
  canais: string[],
): Promise<Map<string, { taxa: number | null; total: number; top5: number }>> {
  const resultado = await ctx.db.execute(sql`
    with financeiro as (${baseFinanceira(ctx, brandIds, canais)}),
    pedidos_do_periodo as (
      select * from financeiro where data_venda >= ${inicio.toISOString()}::timestamptz
        and data_venda <= ${fim.toISOString()}::timestamptz
    ),
    totais_itens as (
      select pi.pedido_id, sum(pi.quantidade * pi.preco_unitario) as valor
      from pedido_item pi inner join pedidos_do_periodo p on p.id = pi.pedido_id
      group by pi.pedido_id
    ),
    vendas_produto as (
      select p.brand_id, pi.produto_id,
        sum(case when t.valor > 0 then p.receita * pi.quantidade * pi.preco_unitario / t.valor else 0 end) as receita
      from pedido_item pi inner join pedidos_do_periodo p on p.id = pi.pedido_id
      inner join totais_itens t on t.pedido_id = p.id
      where pi.produto_id is not null
      group by p.brand_id, pi.produto_id
    ),
    ranqueado as (
      select *, row_number() over (partition by brand_id order by receita desc, produto_id) as posicao
      from vendas_produto
    ),
    totais as (select brand_id, sum(receita) as receita_total from pedidos_do_periodo group by brand_id)
    select t.brand_id, t.receita_total,
      coalesce(sum(r.receita) filter (where r.posicao <= 5), 0) as receita_top5
    from totais t left join ranqueado r on r.brand_id = t.brand_id
    group by t.brand_id, t.receita_total
  `);

  const linhas = (Array.isArray(resultado) ? resultado : (resultado as { rows?: unknown[] }).rows) ?? [];
  const mapa = new Map<string, { taxa: number | null; total: number; top5: number }>();
  for (const linha of linhas as Array<Record<string, unknown>>) {
    const total = paraNumero(linha.receita_total);
    const top5 = paraNumero(linha.receita_top5);
    mapa.set(String(linha.brand_id), { taxa: percentual(top5, total), total, top5 });
  }
  return mapa;
}

/** "Recorrente" = o cliente já tinha um pedido não-cancelado dessa mesma
 *  marca antes deste. Escopo por marca, não pela org inteira: cliente é
 *  compartilhado entre marcas no cadastro, mas comprar da KARZI antes não
 *  faz alguém "cliente recorrente" da WUWU na primeira compra de lá.
 *
 *  Com recorte de canal vale o mesmo raciocínio um nível abaixo: a compra
 *  anterior também precisa ser do canal escolhido. Sem isso, olhar só a Shopee
 *  contava como "voltou" quem tinha comprado no Mercado Livre — recorrência
 *  que aquele canal nunca viu acontecer. */
async function taxaRecorrenciaPorMarca(
  ctx: CrudContext,
  inicio: Date,
  fim: Date,
  brandIds: string[],
  canais: string[],
): Promise<Map<string, { taxa: number | null; total: number; recorrente: number }>> {
  const resultado = await ctx.db.execute(sql`
    with financeiro as (${baseFinanceira(ctx, brandIds, canais)}),
    pedidos_do_periodo as (
      select p.brand_id, p.receita as total,
        exists (
          select 1 from financeiro anterior
          where anterior.cliente_id = p.cliente_id
            and anterior.brand_id = p.brand_id
            and anterior.data_venda < p.data_venda
        ) as recorrente
      from financeiro p
      where p.data_venda >= ${inicio.toISOString()}::timestamptz
        and p.data_venda <= ${fim.toISOString()}::timestamptz
    )
    select brand_id, sum(total) as receita_total,
      sum(total) filter (where recorrente) as receita_recorrente
    from pedidos_do_periodo group by brand_id
  `);

  const linhas = (Array.isArray(resultado) ? resultado : (resultado as { rows?: unknown[] }).rows) ?? [];
  const mapa = new Map<string, { taxa: number | null; total: number; recorrente: number }>();
  for (const linha of linhas as Array<Record<string, unknown>>) {
    const total = paraNumero(linha.receita_total);
    const recorrente = paraNumero(linha.receita_recorrente);
    mapa.set(String(linha.brand_id), { taxa: percentual(recorrente, total), total, recorrente });
  }
  return mapa;
}

export async function obterCrescimentoPorMarca(
  ctx: CrudContext,
  opcoes: { inicio: Date; fim: Date; brandIds: string[]; canais?: string[] },
): Promise<Map<string, CrescimentoMarca>> {
  if (opcoes.brandIds.length === 0) return new Map();

  const canais = opcoes.canais ?? [];
  const [cancelamento, concentracao, recorrencia] = await Promise.all([
    taxasCancelamento(ctx, opcoes.inicio, opcoes.fim, opcoes.brandIds, canais),
    concentracaoTop5PorMarca(ctx, opcoes.inicio, opcoes.fim, opcoes.brandIds, canais),
    taxaRecorrenciaPorMarca(ctx, opcoes.inicio, opcoes.fim, opcoes.brandIds, canais),
  ]);

  const resultado = new Map<string, CrescimentoMarca>();
  for (const brandId of opcoes.brandIds) {
    const cancel = cancelamento.get(brandId);
    const conc = concentracao.get(brandId);
    const rec = recorrencia.get(brandId);
    resultado.set(brandId, {
      brandId,
      taxaCancelamento: cancel?.taxa ?? null,
      totalPedidosBrutos: cancel?.total ?? 0,
      pedidosCanceladosOuDevolvidos: cancel?.cancelados ?? 0,
      concentracaoTop5: conc?.taxa ?? null,
      receitaTotalConcentracao: conc?.total ?? 0,
      receitaTop5: conc?.top5 ?? 0,
      taxaRecorrencia: rec?.taxa ?? null,
      receitaTotalRecorrencia: rec?.total ?? 0,
      receitaRecorrente: rec?.recorrente ?? 0,
    });
  }
  return resultado;
}
