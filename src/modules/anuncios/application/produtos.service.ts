import { and, desc, eq } from "drizzle-orm";
import type { CrudContext } from "@/shared/lib/crud-factory";
import { adsAnuncioSnapshot, adsCampanhaSnapshot } from "@/shared/lib/db/schema";
import { PLATAFORMA_ANUNCIOS_PADRAO, type PlataformaAnuncios } from "../domain/plataformas";
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
  itemId: string;
  campanhaId: string;
  campanhaNome: string;
  titulo: string | null;
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
    return { dataSnapshot: null, sincronizadoEm: null, anuncios: [], desperdicio: { totalEmAtencao: 0, itens: [] } };
  }

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
        eq(adsAnuncioSnapshot.data, ultimaData),
        eq(adsAnuncioSnapshot.plataforma, plataforma),
      )),
  ]);

  const nomeCampanhaPorId = new Map(campanhas.map((c) => [c.campaignId, c.nome]));

  const anuncios: AnuncioProduto[] = itens.map((linha) => {
    const investimento = paraNumero(linha.cost);
    return {
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
    id: a.itemId,
    nome: a.titulo ?? a.itemId,
    cliques: a.cliques,
    gasto: a.investimento,
    vendas: a.vendas,
    roasMinimo: null,
    roasAtual: a.roas,
  }));

  return {
    dataSnapshot: ultimaData,
    sincronizadoEm: ultimoSnapshot?.criadoEm?.toISOString() ?? null,
    anuncios,
    desperdicio: calcularDesperdicio(itensParaDesperdicio, CRITERIOS_DESPERDICIO_PADRAO),
  };
}
