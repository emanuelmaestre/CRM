import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import type { CrudContext } from "@/shared/lib/crud-factory";
import { adsAnuncioSnapshot, adsCampanhaSnapshot, produto } from "@/shared/lib/db/schema";
import {
  DIAS_ATRIBUICAO, diasJanelaPadrao, inicioDaJanelaPadrao,
  PLATAFORMA_ANUNCIOS_PADRAO, type PlataformaAnuncios,
} from "../domain/plataformas";
import {
  calcularDesperdicio, CRITERIOS_DESPERDICIO_PADRAO,
  type DesperdicioEstimado, type ItemAnalisadoDesperdicio,
} from "./metricas-calculadas";

/* ── Produtos (Fase 4 — Apresentação, sub-tela "Produtos") ────────────
   Mesmo snapshot da Visão Geral e de Campanhas, agora olhado de lado: todos
   os anúncios da marca juntos, não agrupados por campanha — para responder
   "quais itens especificamente estão puxando resultado ou desperdiçando
   verba", independente de em qual campanha estão.

   `roasMinimo` por item nasce sempre null hoje (não existe break-even por
   item, só por campanha, e mesmo esse depende de `produto.custo` que não
   existe no schema — ver metricas-calculadas.ts). Por isso o motivo
   "abaixo_do_breakeven" do desperdício nunca dispara aqui ainda; só
   "sem_conversao" (cliques/gasto relevantes, zero venda) — que já é dado
   real e não depende de custo nenhum. */

export interface AnuncioProduto {
  /** Identidade da LINHA, que é o par (campanha, item) e não o item sozinho:
   *  na Shopee o mesmo anúncio costuma estar em mais de uma campanha ao mesmo
   *  tempo, cada uma com gasto e retorno próprios. Usar `itemId` como
   *  identidade colidia — o React acusava chave duplicada na tabela da WUWU e,
   *  pior, a marca de "gasto sem retorno" de uma campanha aparecia também na
   *  linha da outra campanha do mesmo item, que podia estar vendendo bem. */
  linhaId: string;
  itemId: string;
  campanhaId: string;
  campanhaNome: string;
  titulo: string | null;
  /** SKU interno, quando o anúncio bate com um produto do catálogo
   *  (`ads_anuncio_snapshot.produto_id`). Null quando não há correspondência
   *  — produto ainda não sincronizado, ou variação sem SKU mapeado. É o que
   *  liga o anúncio patrocinado ao Estoque; na Shopee, onde o título do
   *  anúncio é o nome comercial de 90 caracteres, costuma ser a única forma
   *  curta de identificar o item. */
  sku: string | null;
  status: string | null;
  preco: number | null;
  /** Data de criação do anúncio (item) no Mercado Livre — confirmado ao
   *  vivo em product_ads/ads/search (ver mercadolivre-ads.provider.ts). */
  criadoEm: string | null;
  recomendado: boolean | null;
  buyBoxWinner: boolean | null;
  permalink: string | null;
  thumbnail: string | null;
  investimento: number;
  receita: number;
  cliques: number;
  impressoes: number;
  vendas: number;
  roas: number | null;
  acos: number | null;
}

export interface ProdutosResultado {
  /** Recorte somado nestes números — igual ao da Visão Geral: um dia no
   *  Mercado Livre, a janela de atribuição na Shopee. Null quando a marca
   *  não tem snapshot nenhum no canal. */
  janela: { inicio: string; fim: string; dias: number; diasAtribuicao: number } | null;
  dataSnapshot: string | null;
  /** Timestamp real da sincronização (ISO, com hora) — `dataSnapshot` é só
   *  o dia do calendário. Ver `criadoEm` em `ads_campanha_snapshot`. */
  sincronizadoEm: string | null;
  anuncios: AnuncioProduto[];
  desperdicio: DesperdicioEstimado;
}

function paraNumero(valor: unknown): number {
  const parsed = Number(valor ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}
function paraNumeroOuNull(valor: unknown): number | null {
  if (valor === null || valor === undefined) return null;
  const parsed = Number(valor);
  return Number.isFinite(parsed) ? parsed : null;
}

/* Vendedor que não preenche SKU na Shopee (comum) recebe do catálogo um SKU
   sintético `shopee-{item_id}[-{model_id}]` — ver `skuDoItemPedido` em
   canais/infrastructure/shopee.provider.ts, que é quem o gera. Ele existe para
   a ingestão de pedidos ter uma chave, não para ser lido: "shopee-58260477465"
   ao lado do título é o item_id que a tela já tem, escrito de novo. Mostrar
   só SKU de verdade — o do vendedor. */
const SKU_SINTETICO_SHOPEE = /^shopee-\d+(-\d+)?$/;

function skuApresentavel(sku: string | undefined): string | null {
  if (!sku || SKU_SINTETICO_SHOPEE.test(sku)) return null;
  return sku;
}

/** Todos os anúncios da marca na data de snapshot mais recente, ordenados
 *  por investimento (maior primeiro) — a mesma leitura de "onde o dinheiro
 *  está indo" de Campanhas, só que no nível de item. */
export async function obterProdutosDaMarca(
  ctx: CrudContext,
  opcoes: { brandId: string; plataforma?: PlataformaAnuncios },
): Promise<ProdutosResultado> {
  const plataforma = opcoes.plataforma ?? PLATAFORMA_ANUNCIOS_PADRAO;

  const ultimoSnapshot = await ctx.db
    .select({ data: adsCampanhaSnapshot.data, criadoEm: adsCampanhaSnapshot.criadoEm })
    .from(adsCampanhaSnapshot)
    .where(and(
      eq(adsCampanhaSnapshot.orgId, ctx.orgId),
      eq(adsCampanhaSnapshot.brandId, opcoes.brandId),
      eq(adsCampanhaSnapshot.plataforma, plataforma),
    ))
    .orderBy(desc(adsCampanhaSnapshot.data), desc(adsCampanhaSnapshot.criadoEm))
    .limit(1)
    .then((rows) => rows[0] ?? null);
  const ultimaData = ultimoSnapshot?.data ?? null;

  if (!ultimaData) {
    return { janela: null, dataSnapshot: null, sincronizadoEm: null, anuncios: [], desperdicio: { totalEmAtencao: 0, itens: [] } };
  }

  // Mesma janela padrão da Visão Geral, pelo mesmo motivo: na Shopee o último
  // dia tem o gasto do item mas ainda não as vendas que ela credita depois do
  // clique, e um "Gasto sem retorno" calculado só nele acusaria de desperdício
  // metade do catálogo todo santo dia.
  const inicioJanela = inicioDaJanelaPadrao(ultimaData, plataforma);

  const [campanhas, itens] = await Promise.all([
    ctx.db
      .select({ campaignId: adsCampanhaSnapshot.campaignId, nome: adsCampanhaSnapshot.nome })
      .from(adsCampanhaSnapshot)
      .where(and(
        eq(adsCampanhaSnapshot.orgId, ctx.orgId),
        eq(adsCampanhaSnapshot.brandId, opcoes.brandId),
        eq(adsCampanhaSnapshot.data, ultimaData),
        eq(adsCampanhaSnapshot.plataforma, plataforma),
      )),
    ctx.db
      .select()
      .from(adsAnuncioSnapshot)
      .where(and(
        eq(adsAnuncioSnapshot.orgId, ctx.orgId),
        eq(adsAnuncioSnapshot.brandId, opcoes.brandId),
        gte(adsAnuncioSnapshot.data, inicioJanela),
        lte(adsAnuncioSnapshot.data, ultimaData),
        eq(adsAnuncioSnapshot.plataforma, plataforma),
      ))
      .orderBy(adsAnuncioSnapshot.data),
  ]);

  const nomeCampanhaPorId = new Map(campanhas.map((c) => [c.campaignId, c.nome]));

  /* SKU interno de quem tem correspondência no catálogo. Uma consulta só,
     com os ids já em mãos — não um SELECT por anúncio. A sincronização já
     resolveu o vínculo (`produto_id`), aqui é só traduzir para algo legível. */
  const produtoIds = [...new Set(itens.map((linha) => linha.produtoId).filter((id): id is string => id !== null))];
  const skuPorProduto = produtoIds.length === 0 ? new Map<string, string>() : new Map(
    (await ctx.db
      .select({ id: produto.id, sku: produto.sku })
      .from(produto)
      .where(and(eq(produto.orgId, ctx.orgId), inArray(produto.id, produtoIds))))
      .map((linha) => [linha.id, linha.sku] as const),
  );

  /* Um item aparece uma vez por dia da janela: somamos o que é somável e
     mantemos a última linha como base para os campos descritivos (título,
     status, preço), que descrevem o item e não o dia. Com janela de um dia
     — o caso do Mercado Livre — isto devolve exatamente a linha original. */
  const porItem = new Map<string, typeof itens>();
  for (const linha of itens) {
    const chave = `${linha.campaignId}:${linha.itemId}`;
    const grupo = porItem.get(chave) ?? [];
    grupo.push(linha);
    porItem.set(chave, grupo);
  }
  const linhasAgregadas = [...porItem.values()].map((linhas) => {
    const base = linhas[linhas.length - 1];
    if (linhas.length === 1) return base;
    const somar = (campo: keyof typeof base) => linhas.reduce((total, l) => total + paraNumero(l[campo]), 0);
    // Arredondado na soma, não só na exibição: 47.92999999999999 vira base de
    // ROAS e de "gasto sem retorno", e o resíduo se propaga pros dois. Mesmo
    // tratamento que a Visão Geral já dá aos totais dela.
    const cost = Math.round(somar("cost") * 100) / 100;
    const totalAmount = Math.round(somar("totalAmount") * 100) / 100;
    return {
      ...base,
      clicks: somar("clicks"),
      prints: somar("prints"),
      unitsQuantity: somar("unitsQuantity"),
      cost: String(cost),
      totalAmount: String(totalAmount),
      // Recalculadas sobre os totais: média de razões daria peso igual a um
      // dia de R$ 0,30 e a um de R$ 80,00.
      roas: cost > 0 ? String(totalAmount / cost) : null,
      acos: totalAmount > 0 ? String((cost / totalAmount) * 100) : null,
    };
  });

  const anuncios: AnuncioProduto[] = linhasAgregadas.map((linha) => {
    const investimento = paraNumero(linha.cost);
    return {
      linhaId: `${linha.campaignId}:${linha.itemId}`,
      itemId: linha.itemId,
      campanhaId: linha.campaignId,
      /* Confirmado ao vivo (22/08/2026): a API do Mercado Livre às vezes
       * devolve um campaign_id diferente pro mesmo anúncio dependendo do
       * endpoint — `campaigns/search` usa um id, `ads/search` usa outro
       * pro mesmo anúncio dessa campanha. Não é bug nosso; o fallback pro
       * id cru é intencional pra nunca esconder o dado, só fica menos
       * bonito quando a API diverge assim. */
      campanhaNome: nomeCampanhaPorId.get(linha.campaignId) ?? `Campanha ${linha.campaignId}`,
      titulo: linha.titulo,
      sku: linha.produtoId ? skuApresentavel(skuPorProduto.get(linha.produtoId)) : null,
      status: linha.status,
      preco: paraNumeroOuNull(linha.preco),
      criadoEm: linha.anuncioCriadoEm?.toISOString() ?? null,
      recomendado: linha.recomendado,
      buyBoxWinner: linha.buyBoxWinner,
      permalink: linha.permalink,
      thumbnail: linha.thumbnail,
      investimento,
      receita: paraNumero(linha.totalAmount),
      cliques: paraNumero(linha.clicks),
      impressoes: paraNumero(linha.prints),
      vendas: paraNumero(linha.unitsQuantity),
      roas: investimento > 0 ? paraNumeroOuNull(linha.roas) : null,
      acos: investimento > 0 ? paraNumeroOuNull(linha.acos) : null,
    };
  }).sort((a, b) => b.investimento - a.investimento);

  const itensParaDesperdicio: ItemAnalisadoDesperdicio[] = anuncios.map((a) => ({
    // Pelo par (campanha, item), a mesma identidade das linhas — ver `linhaId`.
    id: a.linhaId,
    nome: a.titulo ?? a.itemId,
    cliques: a.cliques,
    gasto: a.investimento,
    vendas: a.vendas,
    roasMinimo: null,
    roasAtual: a.roas,
  }));

  return {
    janela: {
      inicio: inicioJanela,
      fim: ultimaData,
      dias: diasJanelaPadrao(plataforma),
      diasAtribuicao: DIAS_ATRIBUICAO[plataforma] ?? 0,
    },
    dataSnapshot: ultimaData,
    sincronizadoEm: ultimoSnapshot?.criadoEm?.toISOString() ?? null,
    anuncios,
    desperdicio: calcularDesperdicio(itensParaDesperdicio, CRITERIOS_DESPERDICIO_PADRAO),
  };
}
