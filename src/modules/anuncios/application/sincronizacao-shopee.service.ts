import { and, eq } from "drizzle-orm";
import type { CrudContext } from "@/shared/lib/crud-factory";
import {
  adsAnuncioSnapshot,
  adsCampanhaSnapshot,
  brand,
  channelAccount,
  produtoCanal,
} from "@/shared/lib/db/schema";
import { isBrandSlug, type BrandSlug } from "@/shared/config/brands";
import {
  criarShopeeAdsProvider,
  dataShopeeAdsParaIso,
  PublicidadeShopeeNaoHabilitadaError,
  type ShopeeCampanhaConfig,
  type ShopeeMetricasDia,
} from "../infrastructure/shopee-ads.provider";
import type { ResultadoSincronizacaoMarca } from "./sincronizacao.service";

/* ── Sincronização diária de Product Ads da Shopee ────────────────
   Mesma estratégia da do Mercado Livre (snapshot diário, isolamento por
   marca, upsert idempotente) e mesmas tabelas — o que separa os dois é a
   coluna `plataforma`. O formato dos dados é que é bem diferente:

   • A Shopee não tem "advertiser": a loja É o anunciante, então não existe
     equivalente de ads_advertiser aqui.
   • O relatório já vem em série diária (`get_product_campaign_daily_
     performance` devolve uma métrica por dia), então não há a distinção
     "snapshot de hoje + backfill histórico" que o ML exige — uma chamada só
     traz a janela inteira.
   • Não existe endpoint de desempenho por item. Nas campanhas de produto o
     normal é a campanha ter um único item, e aí as métricas da campanha SÃO
     as do item. Quando a campanha tem vários itens, gravamos o vínculo
     item↔campanha sem métrica nenhuma, em vez de repetir o número da
     campanha em cada item (o que inflaria o total N vezes). Ver
     `deveAtribuirMetricasAoItem`.

   ATENÇÃO: o contrato da API ainda não foi verificado ao vivo — ver o aviso
   no topo de shopee-ads.provider.ts. */

export const PLATAFORMA_SHOPEE = "shopee";

/** Dias de histórico buscados na primeira sincronização e mantidos depois.
 *  Barato porque a Shopee devolve a série inteira de uma vez; 90 dias é o
 *  mesmo horizonte usado no backfill do Mercado Livre, então as duas
 *  plataformas ficam comparáveis nas telas de histórico. */
export const DIAS_HISTORICO_SHOPEE = 90;

function paraNumero(valor: number | undefined | null): number | null {
  return typeof valor === "number" && Number.isFinite(valor) ? valor : null;
}

function paraTexto(valor: number | undefined | null): string | null {
  const numero = paraNumero(valor);
  return numero === null ? null : String(numero);
}

/** Diferença entre a métrica "broad" (loja toda, 7 dias após o clique) e a
 *  "direct" (só o produto anunciado). A Shopee define broad como o total que
 *  inclui a direct, então a indireta é a subtração — não é estimativa nossa,
 *  é a própria definição dela. Null quando falta qualquer uma das pontas. */
function parteIndireta(broad: number | undefined, direct: number | undefined): number | null {
  const total = paraNumero(broad);
  const direta = paraNumero(direct);
  if (total === null || direta === null) return null;
  return Math.max(total - direta, 0);
}

function parteIndiretaTexto(broad: number | undefined, direct: number | undefined): string | null {
  const valor = parteIndireta(broad, direct);
  return valor === null ? null : String(valor);
}

/** Métricas de campanha só podem ser atribuídas ao item quando a campanha
 *  anuncia um item só — com dois ou mais não há como repartir sem inventar. */
export function deveAtribuirMetricasAoItem(itemIds: string[]): boolean {
  return itemIds.length === 1;
}

function valoresCampanha(
  orgId: string,
  brandId: string,
  contaId: string,
  data: string,
  config: ShopeeCampanhaConfig | undefined,
  campaignId: string,
  nomeFallback: string | null,
  posicionamento: string | null,
  metricas: ShopeeMetricasDia,
) {
  return {
    orgId,
    brandId,
    channelAccountId: contaId,
    campaignId,
    data,
    plataforma: PLATAFORMA_SHOPEE,

    nome: config?.nome ?? nomeFallback ?? `Campanha ${campaignId}`,
    // A Shopee chama de "campaign_status"; quando o setting_info não vem
    // (campanha apagada entre as duas chamadas, por exemplo) preferimos um
    // valor explícito a fingir que está ativa.
    status: config?.status ?? "desconhecido",
    // Não existe "estratégia" na Shopee: o que mais se aproxima é o método de
    // lance (manual/automático). Cai no tipo do anúncio quando falta.
    estrategia: config?.metodoLance ?? config?.adType ?? "desconhecida",
    // `canal` no snapshot é onde o anúncio aparece — no ML é marketplace/
    // mshops, na Shopee é o posicionamento (busca/descoberta).
    canal: config?.posicionamento ?? posicionamento,
    orcamento: config?.orcamento !== null && config?.orcamento !== undefined ? String(config.orcamento) : null,
    roasObjetivo: null,
    acosObjetivo: null,
    moeda: "BRL",
    campanhaCriadaEm: config?.inicioEm ? new Date(config.inicioEm * 1000) : null,
    campanhaAtualizadaEm: null,

    clicks: paraNumero(metricas.clicks),
    prints: paraNumero(metricas.impression),
    ctr: paraTexto(metricas.ctr),
    cost: paraTexto(metricas.expense),
    // `cpc` fica de fora de propósito: o campo com esse nome na resposta da
    // Shopee está documentado como CUSTO POR CONVERSÃO, não custo por clique.
    // Gravar na coluna `cpc` (que o resto do módulo lê como custo por clique)
    // trocaria um número por outro sem ninguém perceber. O custo por clique
    // exibido nas telas já é derivado de investimento ÷ cliques, então nada
    // se perde. VERIFICAR ao vivo antes de mudar isso.
    cpc: null,
    acos: paraTexto(metricas.broad_cir),
    roas: paraTexto(metricas.broad_roi),
    cvr: paraTexto(metricas.cr),
    // Shopee não expõe participação de exibição em nenhuma dessas formas.
    sov: null,
    impressionShare: null,
    topImpressionShare: null,
    lostImpressionShareByBudget: null,
    lostImpressionShareByAdRank: null,
    acosBenchmark: null,
    // Venda orgânica não existe no relatório de Ads da Shopee — deixar null é
    // o que mantém a TACOS honestamente vazia em vez de igual ao ACOS.
    organicUnitsQuantity: null,
    organicUnitsAmount: null,
    organicItemsQuantity: null,
    directItemsQuantity: paraNumero(metricas.direct_order),
    indirectItemsQuantity: parteIndireta(metricas.broad_order, metricas.direct_order),
    advertisingItemsQuantity: paraNumero(metricas.broad_order),
    directUnitsQuantity: paraNumero(metricas.direct_order_amount),
    indirectUnitsQuantity: parteIndireta(metricas.broad_order_amount, metricas.direct_order_amount),
    unitsQuantity: paraNumero(metricas.broad_order_amount),
    directAmount: paraTexto(metricas.direct_gmv),
    indirectAmount: parteIndiretaTexto(metricas.broad_gmv, metricas.direct_gmv),
    totalAmount: paraTexto(metricas.broad_gmv),

    bruto: { config: config ?? null, metricas },
  };
}

function valoresAnuncio(
  orgId: string,
  brandId: string,
  contaId: string,
  data: string,
  campaignId: string,
  itemId: string,
  produtoId: string | null,
  config: ShopeeCampanhaConfig | undefined,
  metricas: ShopeeMetricasDia | null,
) {
  return {
    orgId,
    brandId,
    channelAccountId: contaId,
    campaignId,
    itemId,
    adGroupId: null,
    produtoId,
    data,
    plataforma: PLATAFORMA_SHOPEE,

    titulo: config?.nome ?? null,
    status: config?.status ?? null,
    preco: null,
    anuncioCriadoEm: null,
    recomendado: null,
    buyBoxWinner: null,
    logisticType: null,
    domainId: null,
    permalink: null,
    thumbnail: null,

    clicks: metricas ? paraNumero(metricas.clicks) : null,
    prints: metricas ? paraNumero(metricas.impression) : null,
    ctr: metricas ? paraTexto(metricas.ctr) : null,
    cost: metricas ? paraTexto(metricas.expense) : null,
    cpc: null,
    acos: metricas ? paraTexto(metricas.broad_cir) : null,
    roas: metricas ? paraTexto(metricas.broad_roi) : null,
    cvr: metricas ? paraTexto(metricas.cr) : null,
    organicUnitsQuantity: null,
    directUnitsQuantity: metricas ? paraNumero(metricas.direct_order_amount) : null,
    indirectUnitsQuantity: metricas ? parteIndireta(metricas.broad_order_amount, metricas.direct_order_amount) : null,
    unitsQuantity: metricas ? paraNumero(metricas.broad_order_amount) : null,
    directAmount: metricas ? paraTexto(metricas.direct_gmv) : null,
    indirectAmount: metricas ? parteIndiretaTexto(metricas.broad_gmv, metricas.direct_gmv) : null,
    totalAmount: metricas ? paraTexto(metricas.broad_gmv) : null,

    bruto: { config: config ?? null, metricas, metricasAtribuidas: metricas !== null },
  };
}

async function emLotes<T>(itens: T[], tamanho: number, executar: (item: T) => Promise<unknown>) {
  for (let inicio = 0; inicio < itens.length; inicio += tamanho) {
    await Promise.all(itens.slice(inicio, inicio + tamanho).map(executar));
  }
}

async function sincronizarMarca(
  ctx: CrudContext,
  contaId: string,
  brandId: string,
  brandSlug: BrandSlug,
  referencia: Date,
  dias: number,
): Promise<ResultadoSincronizacaoMarca> {
  const inicio = new Date(referencia);
  inicio.setDate(inicio.getDate() - (dias - 1));

  let campanhasIds: string[];
  let configuracoes: Map<string, ShopeeCampanhaConfig>;
  let desempenhos: Awaited<ReturnType<Awaited<ReturnType<typeof criarShopeeAdsProvider>>["listarDesempenhoDiario"]>>;
  try {
    const provider = await criarShopeeAdsProvider(brandSlug);
    campanhasIds = (await provider.listarCampanhas()).map((campanha) => campanha.campaignId);
    if (campanhasIds.length === 0) {
      return { brandId, brandSlug, status: "ok", campanhas: 0, anuncios: 0 };
    }
    const listaConfig = await provider.obterConfiguracoes(campanhasIds);
    configuracoes = new Map(listaConfig.map((config) => [config.campaignId, config]));
    desempenhos = await provider.listarDesempenhoDiario(campanhasIds, inicio, referencia);
  } catch (erro) {
    if (erro instanceof PublicidadeShopeeNaoHabilitadaError) {
      return { brandId, brandSlug, status: "publicidade_nao_habilitada", campanhas: 0, anuncios: 0, mensagem: erro.message };
    }
    return { brandId, brandSlug, status: "erro", campanhas: 0, anuncios: 0, mensagem: String(erro) };
  }

  // item_id da Shopee é o mesmo external_listing_id já gravado em
  // produto_canal pela sincronização de catálogo — é o que liga o anúncio
  // patrocinado ao produto interno sem uma consulta por item.
  const mapeamentos = await ctx.db
    .select({ produtoId: produtoCanal.produtoId, listingId: produtoCanal.externalListingId })
    .from(produtoCanal)
    .where(and(eq(produtoCanal.orgId, ctx.orgId), eq(produtoCanal.channelAccountId, contaId)));
  const produtoPorListing = new Map(mapeamentos.map((item) => [item.listingId, item.produtoId]));

  let linhasCampanha = 0;
  let linhasAnuncio = 0;

  await emLotes(desempenhos, 4, async (desempenho) => {
    const config = configuracoes.get(desempenho.campaignId);

    for (const metricas of desempenho.dias) {
      const data = dataShopeeAdsParaIso(metricas.date);
      // Sem data não dá pra saber a que dia a métrica pertence — gravar no
      // dia de hoje falsificaria a série histórica.
      if (!data) continue;

      const valores = valoresCampanha(
        ctx.orgId, brandId, contaId, data, config,
        desempenho.campaignId, desempenho.nome, desempenho.posicionamento, metricas,
      );
      await ctx.db.insert(adsCampanhaSnapshot)
        .values(valores)
        .onConflictDoUpdate({
          target: [adsCampanhaSnapshot.orgId, adsCampanhaSnapshot.channelAccountId, adsCampanhaSnapshot.campaignId, adsCampanhaSnapshot.data],
          set: valores,
        });
      linhasCampanha += 1;

      const itemIds = config?.itemIds ?? [];
      const atribuir = deveAtribuirMetricasAoItem(itemIds);
      for (const itemId of itemIds) {
        const valoresItem = valoresAnuncio(
          ctx.orgId, brandId, contaId, data, desempenho.campaignId, itemId,
          produtoPorListing.get(itemId) ?? null, config, atribuir ? metricas : null,
        );
        await ctx.db.insert(adsAnuncioSnapshot)
          .values(valoresItem)
          .onConflictDoUpdate({
            target: [adsAnuncioSnapshot.orgId, adsAnuncioSnapshot.channelAccountId, adsAnuncioSnapshot.campaignId, adsAnuncioSnapshot.itemId, adsAnuncioSnapshot.data],
            set: valoresItem,
          });
        linhasAnuncio += 1;
      }
    }
  });

  // Uma campanha sem nenhum dia devolvido não gera linha: o retorno conta
  // linhas de snapshot gravadas, não campanhas existentes na conta.
  return { brandId, brandSlug, status: "ok", campanhas: linhasCampanha, anuncios: linhasAnuncio };
}

async function listarContasShopeeAds(ctx: CrudContext, channelAccountId?: string) {
  const condicoes = [
    eq(channelAccount.orgId, ctx.orgId),
    eq(channelAccount.tipo, "shopee"),
    eq(channelAccount.status, "conectado"),
    eq(brand.active, true),
  ];
  if (channelAccountId) condicoes.push(eq(channelAccount.id, channelAccountId));

  return ctx.db
    .select({
      contaId: channelAccount.id,
      brandId: channelAccount.brandId,
      brandSlug: brand.slug,
    })
    .from(channelAccount)
    .innerJoin(brand, and(eq(brand.id, channelAccount.brandId), eq(brand.orgId, channelAccount.orgId)))
    .where(and(...condicoes));
}

/** Ponto de entrada: sincroniza Product Ads da Shopee de todas as marcas com
 *  a conta conectada. Isolamento total entre marcas, igual ao do Mercado
 *  Livre — o retorno é uma lista de resultados, nunca uma exceção que pare
 *  tudo no meio. Marca que não autorizou o app de Anúncios cai em "erro" com
 *  a mensagem de credencial ausente, sem derrubar as demais. */
export async function sincronizarAnunciosShopee(
  ctx: CrudContext,
  referencia: Date = new Date(),
  dias: number = DIAS_HISTORICO_SHOPEE,
): Promise<ResultadoSincronizacaoMarca[]> {
  const contas = await listarContasShopeeAds(ctx);
  const resultados: ResultadoSincronizacaoMarca[] = [];
  for (const conta of contas) {
    if (!isBrandSlug(conta.brandSlug)) continue;
    resultados.push(await sincronizarMarca(ctx, conta.contaId, conta.brandId, conta.brandSlug, referencia, dias));
  }
  return resultados;
}

/** Variante da Central de Sincronização: o operador clicou numa conta
 *  específica. */
export async function sincronizarAnunciosShopeeConta(
  ctx: CrudContext,
  channelAccountId: string,
  referencia: Date = new Date(),
  dias: number = DIAS_HISTORICO_SHOPEE,
): Promise<ResultadoSincronizacaoMarca> {
  const conta = await listarContasShopeeAds(ctx, channelAccountId).then((rows) => rows[0]);
  if (!conta) throw new Error("Conta Shopee conectada não encontrada para sincronizar os anúncios patrocinados.");
  if (!isBrandSlug(conta.brandSlug)) throw new Error("Marca Shopee inválida para sincronizar os anúncios patrocinados.");
  return sincronizarMarca(ctx, conta.contaId, conta.brandId, conta.brandSlug, referencia, dias);
}
