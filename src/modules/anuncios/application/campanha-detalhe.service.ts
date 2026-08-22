import { and, desc, eq } from "drizzle-orm";
import type { CrudContext } from "@/shared/lib/crud-factory";
import { adsAnuncioSnapshot, adsCampanhaSnapshot } from "@/shared/lib/db/schema";

/* ── Campanhas (Fase 4 — Apresentação, sub-tela "Campanhas detalhada") ───
   Reaproveita o snapshot mais recente que a Visão Geral já lê, mas descendo
   um nível: os anúncios (itens) que compõem uma campanha, para responder
   "dentro desta campanha, o que está puxando o resultado". Diagnóstico e
   oportunidades continuam só no nível de campanha (Fase 3) — a Fase 5
   (Produtos, ainda não implementada) que traz diagnóstico por item. */

export interface AnuncioDaCampanha {
  itemId: string;
  titulo: string | null;
  status: string | null;
  preco: number | null;
  /** Data de criação do anúncio (item) no Mercado Livre — confirmado ao
   *  vivo em product_ads/ads/search (ver mercadolivre-ads.provider.ts). */
  criadoEm: string | null;
  recomendado: boolean | null;
  permalink: string | null;
  thumbnail: string | null;
  investimento: number;
  receita: number;
  cliques: number;
  impressoes: number;
  vendas: number;
  /** Null quando não há investimento — mesma regra da Visão Geral: "0.0000"
   *  do Mercado Livre é divisão indefinida, não resultado zero. */
  roas: number | null;
  acos: number | null;
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

/** Anúncios de uma campanha específica, na data do snapshot mais recente
 *  daquela campanha (não necessariamente "hoje" — mesma lógica da Visão
 *  Geral, para não sumir com o dado quando a sincronização de hoje ainda
 *  não rodou). Ordenados por investimento, maior primeiro. */
export async function obterAnunciosDaCampanha(
  ctx: CrudContext,
  opcoes: { brandId: string; campanhaId: string },
): Promise<AnuncioDaCampanha[]> {
  const ultimaData = await ctx.db
    .select({ data: adsCampanhaSnapshot.data })
    .from(adsCampanhaSnapshot)
    .where(and(
      eq(adsCampanhaSnapshot.orgId, ctx.orgId),
      eq(adsCampanhaSnapshot.brandId, opcoes.brandId),
      eq(adsCampanhaSnapshot.campaignId, opcoes.campanhaId),
    ))
    .orderBy(desc(adsCampanhaSnapshot.data))
    .limit(1)
    .then((rows) => rows[0]?.data ?? null);

  if (!ultimaData) return [];

  const linhas = await ctx.db
    .select()
    .from(adsAnuncioSnapshot)
    .where(and(
      eq(adsAnuncioSnapshot.orgId, ctx.orgId),
      eq(adsAnuncioSnapshot.brandId, opcoes.brandId),
      eq(adsAnuncioSnapshot.campaignId, opcoes.campanhaId),
      eq(adsAnuncioSnapshot.data, ultimaData),
    ));

  const anuncios: AnuncioDaCampanha[] = linhas.map((linha) => {
    const investimento = paraNumero(linha.cost);
    return {
      itemId: linha.itemId,
      titulo: linha.titulo,
      status: linha.status,
      preco: paraNumeroOuNull(linha.preco),
      criadoEm: linha.anuncioCriadoEm?.toISOString() ?? null,
      recomendado: linha.recomendado,
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
  });

  return anuncios.sort((a, b) => b.investimento - a.investimento);
}
