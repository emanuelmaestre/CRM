import { obterTokenMercadoLivre } from "@/modules/canais/infrastructure/mercadolivre.provider";
import type { BrandSlug } from "@/shared/config/brands";

/* ── Product Ads do Mercado Livre ─────────────────────────────────
   Provider dedicado, separado de mercadolivre.provider.ts de propósito:
   é uma API diferente (Advertising, não Sell), com header próprio
   (Api-Version: 2) e um domínio grande o bastante para merecer módulo
   próprio (módulo Anúncios).

   Todo path e toda métrica aqui foram VERIFICADOS ao vivo contra as 3
   contas reais (KARZI/WUWU/ARMARINHOS LIMA) em 15/08/2026 — não vieram só
   de busca em documentação. A primeira versão deste arquivo usava paths
   e uma lista de métricas tirados de busca na web, e boa parte estava
   errada (endpoint 404, campos rejeitados com 400). Isso importa citar
   porque documentação de API muda e headers de busca resumem errado —
   testar contra a conta real é o que efetivamente comprova o contrato.

   Estrutura real: Advertiser → Campaign → Ads (item). Cada anúncio TEM um
   `ad_group_id`, mas não existe endpoint próprio para listar/gerenciar
   "ad groups" como recurso — é um campo do anúncio, não uma entidade
   navegável separada (campanhas em modo automático têm um ad group
   implícito por trás). Documentação anterior deste arquivo dizia "não
   existe Ad Group" sem qualificar isso — correção registrada aqui. */

const BASE_URL = "https://api.mercadolibre.com";
const API_VERSION = "2";

/** Métricas confirmadas ao vivo no endpoint `campaigns/search` e
 *  `ads/search` desta conta. IMPORTANTE: pedir uma métrica fora desta
 *  lista derruba a resposta inteira com 400 — a API não ignora campo
 *  desconhecido, rejeita a chamada toda. */
export const METRICAS_CAMPANHA = [
  "clicks", "prints", "ctr", "cost", "cpc", "acos", "roas", "cvr", "sov",
  "organic_units_quantity", "organic_units_amount", "organic_items_quantity",
  "direct_items_quantity", "indirect_items_quantity", "advertising_items_quantity",
  "direct_units_quantity", "indirect_units_quantity", "units_quantity",
  "direct_amount", "indirect_amount", "total_amount",
] as const;

/** Testadas ao vivo e confirmadas AUSENTES no endpoint de métricas desta
 *  conta (erro "Field X not allowed at endpoint campaigns_metrics"):
 *  impression_share, top_impression_share, lost_impression_share_by_budget,
 *  lost_impression_share_by_ad_rank, acos_benchmark. A seção "Exposição"
 *  do módulo (conquistadas/perdidas por orçamento/ranking) NÃO pode ser
 *  construída com dado real hoje — nem por falta de habilitação, essas
 *  cinco métricas simplesmente não existem nesta superfície da API para
 *  esta conta. Pode ser uma feature em rollout gradual, uma métrica de
 *  outro tier de conta, ou ter mudado de nome — não inventar um valor
 *  para preencher essa lacuna. */
export const METRICAS_NAO_DISPONIVEIS_HOJE = [
  "impression_share", "top_impression_share",
  "lost_impression_share_by_budget", "lost_impression_share_by_ad_rank",
  "acos_benchmark",
] as const;

export type ChaveMetricaAds = (typeof METRICAS_CAMPANHA)[number];

/** Bloco de métricas cru, exatamente como o Mercado Livre devolve — chaves
 *  snake_case, sem nenhuma tradução ainda. A camada de aplicação (Fase 2)
 *  é quem normaliza isso; aqui só se espelha o payload. */
export type MLMetricasBrutas = Partial<Record<ChaveMetricaAds, number>>;

export interface MLAdvertiser {
  advertiserId: number;
  siteId: string;
}

export interface MLCampanha {
  id: number;
  name: string;
  /** Vem em minúsculo do ML ("paused", "active" — confirmado ao vivo). */
  status: string;
  /** Vem em MAIÚSCULO do ML ("PROFITABILITY" — confirmado ao vivo). Não
   *  normalizamos aqui: quem exibe decide o case, o provider só espelha. */
  strategy: string;
  budget: number | null;
  currencyId: string | null;
  roasTarget: number | null;
  /** Ainda presente na resposta real apesar de anunciado como em
   *  descontinuação — lido só como informação complementar, `roasTarget`
   *  é o alvo primário (ver auditoria da API, seção break-even). */
  acosTarget: number | null;
  channel: string | null;
  dateCreated: string | null;
  lastUpdated: string | null;
  metricas: MLMetricasBrutas;
}

export interface MLAnuncio {
  itemId: string;
  campaignId: number;
  /** Confirmado ao vivo: existe, mas sem endpoint próprio de "ad groups". */
  adGroupId: number | null;
  title: string | null;
  status: string | null;
  price: number | null;
  /** Confirmado ao vivo — é o sinal real de "Mercado Livre recomenda
   *  anunciar" que alimenta a Oportunidade de Produto (Fase 3). */
  recommended: boolean | null;
  buyBoxWinner: boolean | null;
  logisticType: string | null;
  domainId: string | null;
  permalink: string | null;
  thumbnail: string | null;
  metricas: MLMetricasBrutas;
}

/** A API do Mercado Livre devolve 404 "No permissions found for user_id"
 *  quando a conta não tem Publicidade habilitada (Meu perfil → Publicidade)
 *  — mas só no endpoint de descoberta do advertiser. Erro de rota errada
 *  (404 sem esse corpo) ou de parâmetro inválido (400) são bugs nossos,
 *  não falta de permissão — por isso este erro só é lançado explicitamente
 *  em `obterAdvertiser`, nunca genericamente em qualquer 404. */
export class PublicidadeNaoHabilitadaError extends Error {
  constructor(brandSlug: string) {
    super(`Publicidade (Product Ads) não está habilitada na conta Mercado Livre de ${brandSlug}.`);
    this.name = "PublicidadeNaoHabilitadaError";
  }
}

interface MLAdvertiserRaw {
  advertiser_id: number;
  site_id: string;
}

interface MLCampanhaRaw {
  id: number;
  name: string;
  status: string;
  strategy: string;
  budget?: number | null;
  currency_id?: string | null;
  roas_target?: number | null;
  acos_target?: number | null;
  channel?: string | null;
  date_created?: string | null;
  last_updated?: string | null;
  metrics?: MLMetricasBrutas;
}

interface MLAnuncioRaw {
  item_id: string;
  campaign_id: number;
  ad_group_id?: number | null;
  title?: string | null;
  status?: string | null;
  price?: number | null;
  recommended?: boolean | null;
  buy_box_winner?: boolean | null;
  logistic_type?: string | null;
  domain_id?: string | null;
  permalink?: string | null;
  thumbnail?: string | null;
  metrics?: MLMetricasBrutas;
}

function normalizarCampanha(bruta: MLCampanhaRaw): MLCampanha {
  return {
    id: bruta.id,
    name: bruta.name,
    status: bruta.status,
    strategy: bruta.strategy,
    budget: bruta.budget ?? null,
    currencyId: bruta.currency_id ?? null,
    roasTarget: bruta.roas_target ?? null,
    acosTarget: bruta.acos_target ?? null,
    channel: bruta.channel ?? null,
    dateCreated: bruta.date_created ?? null,
    lastUpdated: bruta.last_updated ?? null,
    metricas: bruta.metrics ?? {},
  };
}

function normalizarAnuncio(bruta: MLAnuncioRaw): MLAnuncio {
  return {
    itemId: bruta.item_id,
    campaignId: bruta.campaign_id,
    adGroupId: bruta.ad_group_id ?? null,
    title: bruta.title ?? null,
    status: bruta.status ?? null,
    price: bruta.price ?? null,
    recommended: bruta.recommended ?? null,
    buyBoxWinner: bruta.buy_box_winner ?? null,
    logisticType: bruta.logistic_type ?? null,
    domainId: bruta.domain_id ?? null,
    permalink: bruta.permalink ?? null,
    thumbnail: bruta.thumbnail ?? null,
    metricas: bruta.metrics ?? {},
  };
}

function paraDataML(data: Date): string {
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`;
}

export class MercadoLivreAdsProvider {
  constructor(private readonly accessToken: string, private readonly brandSlug: string) {}

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${BASE_URL}${path}`, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Api-Version": API_VERSION,
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const detail = (await res.text()).replace(/[\r\n]+/g, " ").slice(0, 300);
      throw new Error(`Mercado Livre Ads HTTP ${res.status} em ${path}: ${detail}`);
    }
    return res.json() as Promise<T>;
  }

  /** Primeira chamada de qualquer integração nova: descobre o advertiser_id
   *  do vendedor para o produto PADS (Product Ads) — e devolve o site_id,
   *  necessário em toda chamada seguinte (ver `garantirAdvertiser`). */
  async obterAdvertiser(): Promise<MLAdvertiser> {
    let data: { advertisers?: MLAdvertiserRaw[] };
    try {
      data = await this.get<{ advertisers?: MLAdvertiserRaw[] }>(
        "/advertising/advertisers?product_id=PADS",
      );
    } catch (erro) {
      // Só este endpoint (o de descoberta) tem o 404 documentado de conta
      // sem o produto habilitado — qualquer outra falha aqui é um erro de
      // fato, não deve ser mascarada como "sem permissão".
      if (erro instanceof Error && erro.message.includes("HTTP 404")) {
        throw new PublicidadeNaoHabilitadaError(this.brandSlug);
      }
      throw erro;
    }
    const primeiro = data.advertisers?.[0];
    if (!primeiro) throw new PublicidadeNaoHabilitadaError(this.brandSlug);
    return { advertiserId: primeiro.advertiser_id, siteId: primeiro.site_id };
  }

  /** Campanhas com métricas do período — path confirmado ao vivo:
   *  `/marketplace/advertising/{site}/advertisers/{id}/product_ads/campaigns/search`.
   *  A variante sem `/marketplace` e sem `/search` existe mas devolve 404;
   *  documentação de terceiros mistura as duas. */
  async listarCampanhas(advertiserId: number, siteId: string, dataInicio: Date, dataFim: Date): Promise<MLCampanha[]> {
    const params = new URLSearchParams({
      date_from: paraDataML(dataInicio),
      date_to: paraDataML(dataFim),
      metrics: METRICAS_CAMPANHA.join(","),
      limit: "50",
    });
    const data = await this.get<{ results?: MLCampanhaRaw[] }>(
      `/marketplace/advertising/${siteId}/advertisers/${advertiserId}/product_ads/campaigns/search?${params.toString()}`,
    );
    return (data.results ?? []).map(normalizarCampanha);
  }

  /** Anúncios (itens) com métricas do período — path real confirmado:
   *  `.../product_ads/ads/search` (não `items/search`, que não existe). */
  async listarAnuncios(advertiserId: number, siteId: string, dataInicio: Date, dataFim: Date): Promise<MLAnuncio[]> {
    const params = new URLSearchParams({
      date_from: paraDataML(dataInicio),
      date_to: paraDataML(dataFim),
      metrics: METRICAS_CAMPANHA.join(","),
      limit: "50",
    });
    const data = await this.get<{ results?: MLAnuncioRaw[] }>(
      `/marketplace/advertising/${siteId}/advertisers/${advertiserId}/product_ads/ads/search?${params.toString()}`,
    );
    return (data.results ?? []).map(normalizarAnuncio);
  }
}

export async function criarMLAdsProvider(brandSlug: BrandSlug): Promise<MercadoLivreAdsProvider> {
  const { accessToken } = await obterTokenMercadoLivre(brandSlug);
  return new MercadoLivreAdsProvider(accessToken, brandSlug);
}
