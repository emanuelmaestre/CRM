import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { CrudContext } from "@/shared/lib/crud-factory";
import { pedido } from "@/shared/lib/db/schema";
import { STATUS_PEDIDO_FATURAVEL } from "@/modules/vendas/domain/status-faturamento";
import { valorFaturavelPedidoSql } from "@/modules/vendas/infrastructure/valor-faturamento.sql";

const STATUS_FATURAVEL_SQL = sql.join(STATUS_PEDIDO_FATURAVEL.map((status) => sql`${status}`), sql`, `);
const STATUS_PEDIDO_COM_DESFECHO_SQL = sql.join(
  [...STATUS_PEDIDO_FATURAVEL, "cancelado", "devolvido"].map((status) => sql`${status}`),
  sql`, `,
);
const VALOR_FATURAVEL_P = valorFaturavelPedidoSql(sql.raw("p.total"), sql.raw("p.dados_origem"));

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
   *  comprado dessa marca antes do período. Null sem receita no período. */
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

/** Recorte de canal para as consultas em SQL cru. Lista vazia = sem recorte
 *  (todos os canais), mesma convenção do resto do módulo. Recebe o apelido da
 *  tabela porque a recorrência precisa aplicar o mesmo recorte duas vezes: no
 *  pedido do período e no pedido anterior que o torna recorrente. */
function filtroCanal(canais: string[], apelido = "p") {
  if (canais.length === 0) return sql``;
  const coluna = sql.raw(`${apelido}.canal`);
  return sql` and ${coluna} in (${sql.join(canais.map((canal) => sql`${canal}`), sql`, `)})`;
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
  const linhas = await ctx.db
    .select({
      brandId: pedido.brandId,
      total: sql<number>`count(*) filter (where ${pedido.status} in (${STATUS_PEDIDO_COM_DESFECHO_SQL}))`,
      cancelados: sql<number>`count(*) filter (where ${pedido.status} in ('cancelado', 'devolvido'))`,
    })
    .from(pedido)
    .where(and(
      eq(pedido.orgId, ctx.orgId),
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
    with vendas_produto as (
      select p.brand_id, pi.produto_id,
        sum(
          pi.quantidade * pi.preco_unitario
          * case when p.total > 0 then ${VALOR_FATURAVEL_P} / p.total else 0 end
        ) as receita
      from pedido_item pi
      inner join pedido p on p.id = pi.pedido_id
      where p.org_id = ${ctx.orgId}
        and p.brand_id in (${sql.join(brandIds.map((id) => sql`${id}::uuid`), sql`, `)})
        and p.criado_em >= ${inicio.toISOString()}::timestamptz
        and p.criado_em <= ${fim.toISOString()}::timestamptz
        and p.status in (${STATUS_FATURAVEL_SQL})${filtroCanal(canais)}
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
    with pedidos_do_periodo as (
      select
        p.brand_id,
        ${VALOR_FATURAVEL_P} as total,
        exists (
          select 1 from pedido anterior
          where anterior.cliente_id = p.cliente_id
            and anterior.brand_id = p.brand_id
            and anterior.org_id = p.org_id
            and anterior.criado_em < p.criado_em
            and anterior.status in (${STATUS_FATURAVEL_SQL})${filtroCanal(canais, "anterior")}
        ) as recorrente
      from pedido p
      where p.org_id = ${ctx.orgId}
        and p.brand_id in (${sql.join(brandIds.map((id) => sql`${id}::uuid`), sql`, `)})
        and p.criado_em >= ${inicio.toISOString()}::timestamptz
        and p.criado_em <= ${fim.toISOString()}::timestamptz
        and p.status in (${STATUS_FATURAVEL_SQL})${filtroCanal(canais)}
    )
    select
      brand_id,
      sum(total) as receita_total,
      sum(total) filter (where recorrente) as receita_recorrente
    from pedidos_do_periodo
    group by brand_id
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
