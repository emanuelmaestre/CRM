import crypto from "crypto";
import { obterTokenShopee } from "@/modules/canais/infrastructure/shopee.provider";
import { obterShopeeAppCredenciais, obterShopeeBaseUrl } from "@/shared/config/shopee-env";
import { shopeeFetch } from "@/shared/lib/shopee-proxy";
import type { BrandSlug } from "@/shared/config/brands";

/* ── Product Ads da Shopee ────────────────────────────────────────
   Provider dedicado, separado de shopee.provider.ts pelo mesmo motivo que o
   do Mercado Livre é separado do provider de venda: é outra categoria de app
   no Open Platform ("Ads Service", app "Elisa Lima Anuncios", Go Live em
   26/08/2026), com partner_id/partner_key próprios e autorização OAuth
   própria. Assinar essas rotas com as credenciais do app de catálogo devolve
   error_api_permission — foi exatamente o que aconteceu com a API de Pedidos
   antes do app dela existir (ver comentário em shopee.provider.ts).

   Contrato VERIFICADO ao vivo em 26/08/2026 contra a loja WUWU (shop_id
   1645247022), com `npm run anuncios:shopee:inspecionar`. A primeira versão
   deste arquivo foi escrita a partir da documentação pública e do SDK oficial,
   e duas coisas estavam erradas — as duas silenciosas:

   • `get_product_campaign_daily_performance` devolve `response` como OBJETO
     ({shop_id, region, campaign_list}), não como array de blocos por loja.
   • O campo que a Shopee chama de `cpc` é CUSTO POR CONVERSÃO, não por
     clique: em 20/08 veio cpc=5 com expense=10 e clicks=25 (10÷25=0,40, mas
     10÷2 conversões=5,00). Por isso ele não alimenta a coluna `cpc`.

   Mantido o hábito do módulo do Mercado Livre: o que vale é o que a API de
   fato devolve, não o que a documentação descreve. Rodar o script de novo
   depois de qualquer mudança de contrato. */

/** Formato de data que os relatórios de Ads da Shopee aceitam — DD-MM-YYYY,
 *  diferente do ISO usado no resto da API. Confirmado ao vivo: é também o
 *  formato em que o campo `date` volta na resposta. */
export function paraDataShopeeAds(data: Date): string {
  const dia = String(data.getDate()).padStart(2, "0");
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  return `${dia}-${mes}-${data.getFullYear()}`;
}

/** Converte de volta pro ISO (YYYY-MM-DD) que a coluna `data` do snapshot usa. */
export function dataShopeeAdsParaIso(valor: string | undefined): string | null {
  const encontrado = /^(\d{2})-(\d{2})-(\d{4})$/.exec((valor ?? "").trim());
  if (!encontrado) return null;
  return `${encontrado[3]}-${encontrado[2]}-${encontrado[1]}`;
}

/** A loja nunca usou Shopee Ads (ou o app não tem a permissão liberada).
 *  Não é erro transitório: não adianta repetir a chamada na mesma execução,
 *  e a sincronização trata como "sem publicidade" em vez de falha. */
export class PublicidadeShopeeNaoHabilitadaError extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "PublicidadeShopeeNaoHabilitadaError";
  }
}

/** Erros da Shopee que significam "esta loja/app não tem Ads", não "deu ruim
 *  agora". VERIFICAR: a lista pode crescer quando virmos os códigos reais. */
const ERROS_SEM_PUBLICIDADE = new Set([
  "error_api_permission",
  "error_permission",
  "ads.ads_not_open",
  "ads.shop_not_ads_user",
]);

export interface ShopeeCampanhaId {
  campaignId: string;
  adType: string | null;
}

export interface ShopeeCampanhaConfig {
  campaignId: string;
  adType: string | null;
  nome: string | null;
  status: string | null;
  metodoLance: string | null;
  posicionamento: string | null;
  orcamento: number | null;
  inicioEm: number | null;
  fimEm: number | null;
  itemIds: string[];
}

/** Métricas cruas de um dia de campanha, com os nomes da própria Shopee. A
 *  tradução pros nomes do snapshot (que nasceram do Mercado Livre) fica no
 *  serviço de sincronização, não aqui — provider não inventa nome de campo. */
export interface ShopeeMetricasDia {
  date?: string;
  impression?: number;
  clicks?: number;
  ctr?: number;
  expense?: number;
  broad_gmv?: number;
  broad_order?: number;
  broad_order_amount?: number;
  broad_roi?: number;
  broad_cir?: number;
  cr?: number;
  cpc?: number;
  direct_order?: number;
  direct_order_amount?: number;
  direct_gmv?: number;
  direct_roi?: number;
  direct_cir?: number;
  direct_cr?: number;
  cpdc?: number;
}

export interface ShopeeDesempenhoCampanha {
  campaignId: string;
  adType: string | null;
  nome: string | null;
  posicionamento: string | null;
  /** Um ponto por dia da janela pedida, na ordem devolvida pela Shopee. */
  dias: ShopeeMetricasDia[];
}

interface RespostaShopee<T> {
  error?: string;
  message?: string;
  response?: T;
  request_id?: string;
}

/** Envelope do relatório diário por campanha, como a Shopee devolve de fato. */
interface BlocoDesempenhoLoja {
  shop_id?: number;
  region?: string;
  campaign_list?: {
    campaign_id?: number | string;
    ad_type?: string;
    ad_name?: string;
    campaign_placement?: string;
    metrics_list?: ShopeeMetricasDia[];
  }[];
}

interface CredenciaisAds {
  partnerId: string;
  partnerKey: string;
  shopId: string;
  accessToken: string;
}

/** Quantas campanhas cabem numa chamada de setting_info/daily_performance.
 *  A documentação não é explícita sobre o teto; 100 é o limite usado pelos
 *  outros endpoints paginados da Shopee e serve como escolha conservadora.
 *  `campaign_id_list` separado por vírgula confirmado ao vivo em 26/08. */
const CAMPANHAS_POR_CHAMADA = 100;

/** Teto de dias por chamada de relatório. A API de pedidos da Shopee rejeita
 *  janelas maiores que 15 dias (ver shopee.provider.ts) — sem confirmação de
 *  que o relatório de Ads tenha o mesmo limite, mas fatiar é barato e o custo
 *  de descobrir em produção é uma sincronização inteira perdida. */
const DIAS_POR_CHAMADA = 15;

export class ShopeeAdsProvider {
  private readonly host = obterShopeeBaseUrl();

  constructor(private readonly creds: CredenciaisAds) {}

  /** Mesma assinatura das rotas de loja: partner_id + caminho COMPLETO (com
   *  /api/v2) + timestamp + access_token + shop_id. Assinar só o sufixo
   *  devolve "Wrong sign" — erro já cometido uma vez neste projeto, ver o
   *  comentário longo em shopee.provider.ts. */
  private assinar(apiPath: string, timestamp: number): string {
    const base = `${this.creds.partnerId}${apiPath}${timestamp}${this.creds.accessToken}${this.creds.shopId}`;
    return crypto.createHmac("sha256", this.creds.partnerKey).update(base).digest("hex");
  }

  private url(path: string, params: Record<string, string | number> = {}): string {
    const apiPath = `/api/v2${path}`;
    const ts = Math.floor(Date.now() / 1000);
    const qs = new URLSearchParams({
      partner_id: this.creds.partnerId,
      shop_id: this.creds.shopId,
      access_token: this.creds.accessToken,
      timestamp: String(ts),
      sign: this.assinar(apiPath, ts),
      ...Object.fromEntries(Object.entries(params).map(([chave, valor]) => [chave, String(valor)])),
    });
    return `${this.host}${apiPath}?${qs}`;
  }

  private async chamar<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
    // shopeeFetch, nunca fetch nativo: a saída precisa passar pelo proxy de
    // IP fixo declarado na whitelist do app (os mesmos dois IPs Webshare já
    // cadastrados nos outros dois apps). Sem isso: 403 source_ip_undeclared.
    const resposta = await shopeeFetch(this.url(path, params), {
      signal: AbortSignal.timeout(15_000),
    });

    if (!resposta.ok) {
      const detalhe = (await resposta.text()).replace(/[\r\n]+/g, " ").slice(0, 240);
      throw new Error(`Shopee Ads ${path} falhou (${resposta.status}): ${detalhe}`);
    }

    const corpo: RespostaShopee<T> = await resposta.json();
    if (corpo.error) {
      const mensagem = `Shopee Ads ${path}: ${corpo.error}${corpo.message ? ` — ${corpo.message}` : ""}`;
      if (ERROS_SEM_PUBLICIDADE.has(corpo.error)) {
        throw new PublicidadeShopeeNaoHabilitadaError(mensagem);
      }
      throw new Error(mensagem);
    }

    return corpo.response as T;
  }

  /** Saldo da carteira de Ads. Serve de teste de fumaça barato: se este
   *  endpoint responde, o par partner_id/partner_key e o token estão certos. */
  async obterSaldo(): Promise<number | null> {
    const resposta = await this.chamar<{ total_balance?: number }>("/ads/get_total_balance");
    return typeof resposta?.total_balance === "number" ? resposta.total_balance : null;
  }

  /** Todos os IDs de campanha de produto da loja, paginando até o fim. */
  async listarCampanhas(): Promise<ShopeeCampanhaId[]> {
    const campanhas: ShopeeCampanhaId[] = [];
    let offset = 0;

    // Teto de páginas pra nunca virar laço infinito se has_next_page vier
    // errado — mesmo cuidado usado na paginação de pedidos.
    for (let pagina = 0; pagina < 50; pagina += 1) {
      const resposta = await this.chamar<{
        campaign_list?: { campaign_id?: number | string; ad_type?: string }[];
        has_next_page?: boolean;
      }>("/ads/get_product_level_campaign_id_list", { offset, limit: CAMPANHAS_POR_CHAMADA });

      const lote = resposta?.campaign_list ?? [];
      for (const item of lote) {
        if (item.campaign_id === undefined || item.campaign_id === null) continue;
        campanhas.push({ campaignId: String(item.campaign_id), adType: item.ad_type ?? null });
      }

      if (!resposta?.has_next_page || lote.length === 0) break;
      offset += lote.length;
    }

    return campanhas;
  }

  /** Configuração (nome, status, orçamento, itens) das campanhas pedidas. */
  async obterConfiguracoes(campaignIds: string[]): Promise<ShopeeCampanhaConfig[]> {
    const configuracoes: ShopeeCampanhaConfig[] = [];

    for (const lote of emLotes(campaignIds, CAMPANHAS_POR_CHAMADA)) {
      const resposta = await this.chamar<{
        campaign_list?: {
          campaign_id?: number | string;
          common_info?: {
            ad_type?: string;
            ad_name?: string;
            campaign_status?: string;
            bidding_method?: string;
            campaign_placement?: string;
            campaign_budget?: number;
            campaign_duration?: { start_time?: number; end_time?: number };
            item_id_list?: (number | string)[];
          };
        }[];
      }>("/ads/get_product_level_campaign_setting_info", {
        // Lista em GET vai separada por vírgula — confirmado ao vivo.
        campaign_id_list: lote.join(","),
        // 1 = common_info. Os outros tipos (lance manual/automático) não
        // alimentam nenhum campo do snapshot hoje, então não são pedidos.
        info_type_list: "1",
      });

      for (const item of resposta?.campaign_list ?? []) {
        if (item.campaign_id === undefined || item.campaign_id === null) continue;
        const comum = item.common_info ?? {};
        configuracoes.push({
          campaignId: String(item.campaign_id),
          adType: comum.ad_type ?? null,
          nome: comum.ad_name ?? null,
          status: comum.campaign_status ?? null,
          metodoLance: comum.bidding_method ?? null,
          posicionamento: comum.campaign_placement ?? null,
          orcamento: typeof comum.campaign_budget === "number" ? comum.campaign_budget : null,
          inicioEm: comum.campaign_duration?.start_time ?? null,
          fimEm: comum.campaign_duration?.end_time ?? null,
          itemIds: (comum.item_id_list ?? []).map(String),
        });
      }
    }

    return configuracoes;
  }

  /** Série diária por campanha. A Shopee devolve um bloco da loja com a lista
   *  de campanhas dentro, e as métricas de cada dia dentro de cada campanha —
   *  por isso o achatamento em duas camadas aqui.
   *
   *  O envelope é um OBJETO, não um array (a documentação sugeria array, e a
   *  primeira versão deste método quebrou com "is not iterable" na primeira
   *  chamada real). Aceitamos os dois formatos porque a diferença custa uma
   *  linha e outra região pode devolver diferente. */
  async listarDesempenhoDiario(
    campaignIds: string[],
    inicio: Date,
    fim: Date,
  ): Promise<ShopeeDesempenhoCampanha[]> {
    const porCampanha = new Map<string, ShopeeDesempenhoCampanha>();

    for (const janela of janelasDeDias(inicio, fim, DIAS_POR_CHAMADA)) {
      for (const lote of emLotes(campaignIds, CAMPANHAS_POR_CHAMADA)) {
        const resposta = await this.chamar<BlocoDesempenhoLoja | BlocoDesempenhoLoja[]>(
          "/ads/get_product_campaign_daily_performance",
          {
            campaign_id_list: lote.join(","),
            start_date: paraDataShopeeAds(janela.inicio),
            end_date: paraDataShopeeAds(janela.fim),
          },
        );

        const blocos = Array.isArray(resposta) ? resposta : resposta ? [resposta] : [];
        for (const bloco of blocos) {
          for (const campanha of bloco.campaign_list ?? []) {
            if (campanha.campaign_id === undefined || campanha.campaign_id === null) continue;
            const id = String(campanha.campaign_id);
            const atual = porCampanha.get(id) ?? {
              campaignId: id,
              adType: campanha.ad_type ?? null,
              nome: campanha.ad_name ?? null,
              posicionamento: campanha.campaign_placement ?? null,
              dias: [],
            };
            atual.dias.push(...(campanha.metrics_list ?? []));
            porCampanha.set(id, atual);
          }
        }
      }
    }

    return [...porCampanha.values()];
  }

  /** Série diária da loja inteira (todos os anúncios CPC somados). Não entra
   *  no snapshot por campanha — serve de conferência: a soma das campanhas
   *  tem que bater com isto. */
  async listarDesempenhoLoja(inicio: Date, fim: Date): Promise<Record<string, unknown>[]> {
    const pontos: Record<string, unknown>[] = [];
    for (const janela of janelasDeDias(inicio, fim, DIAS_POR_CHAMADA)) {
      const resposta = await this.chamar<Record<string, unknown>[]>(
        "/ads/get_all_cpc_ads_daily_performance",
        { start_date: paraDataShopeeAds(janela.inicio), end_date: paraDataShopeeAds(janela.fim) },
      );
      pontos.push(...(resposta ?? []));
    }
    return pontos;
  }
}

function* emLotes<T>(itens: T[], tamanho: number): Generator<T[]> {
  for (let inicio = 0; inicio < itens.length; inicio += tamanho) {
    yield itens.slice(inicio, inicio + tamanho);
  }
}

/** Fatia [inicio, fim] em janelas de no máximo `dias` dias, inclusive nas duas
 *  pontas — o mesmo formato que a fatia de 15 dias dos pedidos usa. */
export function janelasDeDias(inicio: Date, fim: Date, dias: number): { inicio: Date; fim: Date }[] {
  const janelas: { inicio: Date; fim: Date }[] = [];
  const umDiaMs = 24 * 60 * 60 * 1000;
  let cursor = new Date(inicio);
  while (cursor.getTime() <= fim.getTime()) {
    const proximo = new Date(Math.min(cursor.getTime() + (dias - 1) * umDiaMs, fim.getTime()));
    janelas.push({ inicio: new Date(cursor), fim: proximo });
    cursor = new Date(proximo.getTime() + umDiaMs);
  }
  return janelas;
}

/** Monta o provider com o par partner_id/partner_key do app de Anúncios e o
 *  token OAuth daquele app (canal_tokens.canal = "shopee_anuncios"). Falha
 *  explícita quando falta um dos dois: assinar com a credencial do app errado
 *  só devolveria "Wrong sign" ou error_api_permission, erros que não apontam
 *  pra causa. */
export async function criarShopeeAdsProvider(brandSlug: BrandSlug): Promise<ShopeeAdsProvider> {
  const { partnerId, partnerKey } = obterShopeeAppCredenciais("anuncios");
  if (!partnerId || !partnerKey) {
    throw new Error(
      "Credenciais do app Shopee Anúncios não configuradas (SHOPEE_PARTNER_ID_ANUNCIOS_* / SHOPEE_PARTNER_KEY_ANUNCIOS_*).",
    );
  }

  const { shopId, accessToken } = await obterTokenShopee(brandSlug, "anuncios");
  return new ShopeeAdsProvider({ partnerId, partnerKey, shopId, accessToken });
}
