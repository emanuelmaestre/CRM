import { and, eq } from "drizzle-orm";
import type { CrudContext } from "@/shared/lib/crud-factory";
import {
  adsAdvertiser,
  adsAnuncioSnapshot,
  adsCampanhaSnapshot,
  brand,
  channelAccount,
  produtoCanal,
} from "@/shared/lib/db/schema";
import {
  criarMLAdsProvider,
  PublicidadeNaoHabilitadaError,
  type MLAnuncio,
  type MLCampanha,
} from "../infrastructure/mercadolivre-ads.provider";
import { isBrandSlug, type BrandSlug } from "@/shared/config/brands";

/* ── Sincronização diária (Fase 1 — Dados) ────────────────────────
   Uma chamada por marca por dia é o suficiente: a API do Mercado Livre só
   atualiza os números de publicidade algumas vezes ao dia, então rodar de
   hora em hora não traria dado mais fresco, só gastaria rate limit à toa
   (mesmo raciocínio já aplicado à coleta de estoque, ver A5/A29).

   O resultado nunca é "tudo ou nada": cada marca é isolada (uma conta sem
   Publicidade habilitada não derruba a sincronização das outras), e dentro
   de uma marca, uma campanha com erro não impede as demais de salvarem. */

export interface ResultadoSincronizacaoMarca {
  brandId: string;
  brandSlug: string;
  status: "ok" | "publicidade_nao_habilitada" | "erro";
  campanhas: number;
  anuncios: number;
  mensagem?: string;
}

function paraNumero(valor: number | undefined): number | null {
  return typeof valor === "number" && Number.isFinite(valor) ? valor : null;
}

/** Garante o advertiserId salvo para a conta — descobre uma vez, reaproveita
 *  depois. Lança PublicidadeNaoHabilitadaError se a conta nunca teve o
 *  produto ativado (não é erro transitório, então não vale tentar de novo
 *  na mesma chamada). */
async function garantirAdvertiser(
  ctx: CrudContext,
  contaId: string,
  orgId: string,
  brandId: string,
  brandSlug: BrandSlug,
): Promise<{ advertiserId: string; siteId: string }> {
  const existente = await ctx.db
    .select({ advertiserId: adsAdvertiser.advertiserId, siteId: adsAdvertiser.siteId })
    .from(adsAdvertiser)
    .where(and(eq(adsAdvertiser.orgId, orgId), eq(adsAdvertiser.channelAccountId, contaId)))
    .then((rows) => rows[0]);
  if (existente) return existente;

  const provider = await criarMLAdsProvider(brandSlug);
  const advertiser = await provider.obterAdvertiser();

  await ctx.db.insert(adsAdvertiser).values({
    orgId,
    brandId,
    channelAccountId: contaId,
    advertiserId: String(advertiser.advertiserId),
    siteId: advertiser.siteId,
  }).onConflictDoNothing();

  return { advertiserId: String(advertiser.advertiserId), siteId: advertiser.siteId };
}

function valoresCampanha(
  orgId: string,
  brandId: string,
  contaId: string,
  data: string,
  campanha: MLCampanha,
) {
  const m = campanha.metricas;
  return {
    orgId,
    brandId,
    channelAccountId: contaId,
    campaignId: String(campanha.id),
    data,
    nome: campanha.name,
    status: campanha.status,
    estrategia: campanha.strategy,
    canal: campanha.channel,
    orcamento: campanha.budget !== null ? String(campanha.budget) : null,
    roasObjetivo: campanha.roasTarget !== null ? String(campanha.roasTarget) : null,
    acosObjetivo: campanha.acosTarget !== null ? String(campanha.acosTarget) : null,
    moeda: campanha.currencyId,
    campanhaCriadaEm: campanha.dateCreated ? new Date(campanha.dateCreated) : null,
    campanhaAtualizadaEm: campanha.lastUpdated ? new Date(campanha.lastUpdated) : null,
    clicks: paraNumero(m.clicks),
    prints: paraNumero(m.prints),
    ctr: m.ctr !== undefined ? String(m.ctr) : null,
    cost: m.cost !== undefined ? String(m.cost) : null,
    cpc: m.cpc !== undefined ? String(m.cpc) : null,
    acos: m.acos !== undefined ? String(m.acos) : null,
    roas: m.roas !== undefined ? String(m.roas) : null,
    cvr: m.cvr !== undefined ? String(m.cvr) : null,
    sov: m.sov !== undefined ? String(m.sov) : null,
    // impressionShare/topImpressionShare/lostImpressionShareBy*/acosBenchmark
    // ficam de fora de propósito: confirmado ao vivo que a API rejeita essas
    // 5 métricas neste endpoint hoje (ver METRICAS_NAO_DISPONIVEIS_HOJE no
    // provider) — as colunas continuam no schema para quando/se existirem.
    organicUnitsQuantity: paraNumero(m.organic_units_quantity),
    organicUnitsAmount: m.organic_units_amount !== undefined ? String(m.organic_units_amount) : null,
    organicItemsQuantity: paraNumero(m.organic_items_quantity),
    directItemsQuantity: paraNumero(m.direct_items_quantity),
    indirectItemsQuantity: paraNumero(m.indirect_items_quantity),
    advertisingItemsQuantity: paraNumero(m.advertising_items_quantity),
    directUnitsQuantity: paraNumero(m.direct_units_quantity),
    indirectUnitsQuantity: paraNumero(m.indirect_units_quantity),
    unitsQuantity: paraNumero(m.units_quantity),
    directAmount: m.direct_amount !== undefined ? String(m.direct_amount) : null,
    indirectAmount: m.indirect_amount !== undefined ? String(m.indirect_amount) : null,
    totalAmount: m.total_amount !== undefined ? String(m.total_amount) : null,
    bruto: campanha,
  };
}

function valoresAnuncio(
  orgId: string,
  brandId: string,
  contaId: string,
  data: string,
  anuncio: MLAnuncio,
  produtoId: string | null,
) {
  const m = anuncio.metricas;
  return {
    orgId,
    brandId,
    channelAccountId: contaId,
    campaignId: String(anuncio.campaignId),
    itemId: anuncio.itemId,
    adGroupId: anuncio.adGroupId !== null ? String(anuncio.adGroupId) : null,
    produtoId,
    data,
    titulo: anuncio.title,
    status: anuncio.status,
    preco: anuncio.price !== null ? String(anuncio.price) : null,
    recomendado: anuncio.recommended,
    buyBoxWinner: anuncio.buyBoxWinner,
    logisticType: anuncio.logisticType,
    domainId: anuncio.domainId,
    permalink: anuncio.permalink,
    thumbnail: anuncio.thumbnail,
    clicks: paraNumero(m.clicks),
    prints: paraNumero(m.prints),
    ctr: m.ctr !== undefined ? String(m.ctr) : null,
    cost: m.cost !== undefined ? String(m.cost) : null,
    cpc: m.cpc !== undefined ? String(m.cpc) : null,
    acos: m.acos !== undefined ? String(m.acos) : null,
    roas: m.roas !== undefined ? String(m.roas) : null,
    cvr: m.cvr !== undefined ? String(m.cvr) : null,
    organicUnitsQuantity: paraNumero(m.organic_units_quantity),
    directUnitsQuantity: paraNumero(m.direct_units_quantity),
    indirectUnitsQuantity: paraNumero(m.indirect_units_quantity),
    unitsQuantity: paraNumero(m.units_quantity),
    directAmount: m.direct_amount !== undefined ? String(m.direct_amount) : null,
    indirectAmount: m.indirect_amount !== undefined ? String(m.indirect_amount) : null,
    totalAmount: m.total_amount !== undefined ? String(m.total_amount) : null,
    bruto: anuncio,
  };
}

async function sincronizarMarca(
  ctx: CrudContext,
  contaId: string,
  brandId: string,
  brandSlug: BrandSlug,
  referencia: Date,
): Promise<ResultadoSincronizacaoMarca> {
  const data = `${referencia.getFullYear()}-${String(referencia.getMonth() + 1).padStart(2, "0")}-${String(referencia.getDate()).padStart(2, "0")}`;

  let advertiserId: string;
  let siteId: string;
  try {
    const advertiser = await garantirAdvertiser(ctx, contaId, ctx.orgId, brandId, brandSlug);
    advertiserId = advertiser.advertiserId;
    siteId = advertiser.siteId;
  } catch (erro) {
    if (erro instanceof PublicidadeNaoHabilitadaError) {
      return { brandId, brandSlug, status: "publicidade_nao_habilitada", campanhas: 0, anuncios: 0, mensagem: erro.message };
    }
    return { brandId, brandSlug, status: "erro", campanhas: 0, anuncios: 0, mensagem: String(erro) };
  }

  const provider = await criarMLAdsProvider(brandSlug);

  let campanhas: MLCampanha[];
  let anuncios: MLAnuncio[];
  try {
    // Uma chamada para todas as campanhas e uma para todos os anúncios do
    // advertiser inteiro — confirmado ao vivo que `ads/search` não exige
    // filtro por campanha, então não há fan-out nenhum aqui (diferente do
    // que a primeira versão deste arquivo presumia).
    [campanhas, anuncios] = await Promise.all([
      provider.listarCampanhas(Number(advertiserId), siteId, referencia, referencia),
      provider.listarAnuncios(Number(advertiserId), siteId, referencia, referencia),
    ]);
  } catch (erro) {
    if (erro instanceof PublicidadeNaoHabilitadaError) {
      return { brandId, brandSlug, status: "publicidade_nao_habilitada", campanhas: 0, anuncios: 0, mensagem: erro.message };
    }
    return { brandId, brandSlug, status: "erro", campanhas: 0, anuncios: 0, mensagem: String(erro) };
  }

  if (campanhas.length === 0) {
    return { brandId, brandSlug, status: "ok", campanhas: 0, anuncios: 0 };
  }

  // Mapa listingId → produtoId, para ligar cada anúncio ao catálogo interno
  // sem uma query por item — o mesmo listing_id que o Ads usa como item_id é
  // o external_listing_id já salvo em produto_canal (ver ingestão de estoque).
  const mapeamentos = await ctx.db
    .select({ produtoId: produtoCanal.produtoId, listingId: produtoCanal.externalListingId })
    .from(produtoCanal)
    .where(and(eq(produtoCanal.orgId, ctx.orgId), eq(produtoCanal.channelAccountId, contaId)));
  const produtoPorListing = new Map(mapeamentos.map((item) => [item.listingId, item.produtoId]));

  for (const campanha of campanhas) {
    await ctx.db.insert(adsCampanhaSnapshot)
      .values(valoresCampanha(ctx.orgId, brandId, contaId, data, campanha))
      .onConflictDoUpdate({
        target: [adsCampanhaSnapshot.orgId, adsCampanhaSnapshot.channelAccountId, adsCampanhaSnapshot.campaignId, adsCampanhaSnapshot.data],
        set: valoresCampanha(ctx.orgId, brandId, contaId, data, campanha),
      });
  }

  for (const anuncio of anuncios) {
    const produtoId = produtoPorListing.get(anuncio.itemId) ?? null;
    await ctx.db.insert(adsAnuncioSnapshot)
      .values(valoresAnuncio(ctx.orgId, brandId, contaId, data, anuncio, produtoId))
      .onConflictDoUpdate({
        target: [adsAnuncioSnapshot.orgId, adsAnuncioSnapshot.channelAccountId, adsAnuncioSnapshot.campaignId, adsAnuncioSnapshot.itemId, adsAnuncioSnapshot.data],
        set: valoresAnuncio(ctx.orgId, brandId, contaId, data, anuncio, produtoId),
      });
  }

  return { brandId, brandSlug, status: "ok", campanhas: campanhas.length, anuncios: anuncios.length };
}

/** Ponto de entrada da Fase 1: sincroniza todas as marcas com conta do
 *  Mercado Livre conectada. Isolamento total entre marcas — o retorno é uma
 *  lista de resultados, nunca uma exceção que pare tudo no meio. */
export async function sincronizarAnunciosMercadoLivre(
  ctx: CrudContext,
  referencia: Date = new Date(),
): Promise<ResultadoSincronizacaoMarca[]> {
  const contas = await ctx.db
    .select({
      contaId: channelAccount.id,
      brandId: channelAccount.brandId,
      brandSlug: brand.slug,
    })
    .from(channelAccount)
    .innerJoin(brand, and(eq(brand.id, channelAccount.brandId), eq(brand.orgId, channelAccount.orgId)))
    .where(and(
      eq(channelAccount.orgId, ctx.orgId),
      eq(channelAccount.tipo, "mercadolivre"),
      eq(channelAccount.status, "conectado"),
      eq(brand.active, true),
    ));

  const resultados: ResultadoSincronizacaoMarca[] = [];
  for (const conta of contas) {
    if (!isBrandSlug(conta.brandSlug)) continue;
    resultados.push(await sincronizarMarca(ctx, conta.contaId, conta.brandId, conta.brandSlug, referencia));
  }
  return resultados;
}
