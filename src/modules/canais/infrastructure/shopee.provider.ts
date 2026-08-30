import crypto from "crypto";
import type { ChannelProvider, EstoqueCanalRef, OpcoesBuscaPedidos, PedidoNormalizado, SaudeConector } from "../domain/ports";
import { shopeeFetch } from "@/shared/lib/shopee-proxy";
import { brandEnvSuffix, type BrandSlug } from "@/shared/config/brands";
import { obterShopeeBaseUrl, obterShopeeAppCredenciais, canalTokenShopee, urlProdutoShopee, type ShopeeApp } from "@/shared/config/shopee-env";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

interface ShopeeCredentials {
  partnerId: string;
  partnerKey: string;
  shopId: string;
  accessToken: string;
}

/* Campos além do mínimo do ML: a Shopee entrega em `get_comment` coisas que
   o Mercado Livre simplesmente não expõe, e guardar só o denominador comum
   deixava a avaliação vaga na tela — nota e texto, quando havia texto.
   Verificado ao vivo em 28/08/2026 contra as duas lojas (125 comentários):
   `order_sn` e `buyer_username` vêm em 100% deles, e 13% (WUWU) a 32%
   (Armarinhos Lima) trazem foto ou vídeo. Tudo isso estava sendo descartado
   no mapeamento.

   São opcionais porque `MLOpiniao` divide a mesma tela e nunca vai ter esses
   campos — quem renderiza checa a presença, não o canal. */
export interface ShopeeOpiniao {
  id: string;
  titulo: string | null;
  conteudo: string | null;
  nota: number;
  criadaEm: string | null;
  /** Quem escreveu. Na Shopee é público (aparece no anúncio), diferente do
   *  ML, onde a opinião é anônima por política e só dá pra deduzir por
   *  cruzamento com pedidos. */
  autor?: string | null;
  /** `order_sn` do pedido que originou a avaliação. Esta é a diferença que
   *  mais importa: no ML o comprador é DEDUZIDO (e só quando há um candidato
   *  único na janela); aqui o próprio canal diz qual pedido é, sem chute. */
  pedidoCanal?: string | null;
  fotos?: string[];
  videos?: string[];
  /** Avaliação ocultada na vitrine da Shopee. Continua contando na média. */
  oculta?: boolean;
}

export interface ShopeeAnuncioAvaliacao {
  itemId: string;
  title: string;
  ratingAverage: number | null;
  reviewsTotal: number;
  ratingLevels: Record<string, number>;
  opinioes: ShopeeOpiniao[];
}

/** Mesmo formato mínimo que `MLAnuncioCatalogo` precisa pro importador de
 *  Estoque (ver importar-catalogo.service.ts) — sem status/permalink porque
 *  o próprio ML também não usa esses campos hoje, mesma decisão dos dois lados. */
export interface ShopeeAnuncioCatalogo {
  listingId: string;
  variationId: string | null;
  externalSku: string | null;
  title: string;
  availableQuantity: number;
  price: string;
}

/** Por que anúncio ficou de fora do catálogo importado. Serializado dentro do
 *  resultado da execução, para o motivo ficar gravado no banco em vez de
 *  evaporar num `console.error` que ninguém lê. */
export interface DiagnosticoCatalogoShopee {
  anunciosConsultados: number;
  /** Pausado, banido ou removido — não vira produto novo, de propósito. */
  foraDoStatusNormal: number;
  comVariacao: number;
  /** Anúncios cuja busca de variação falhou e entraram só no nível do anúncio. */
  variacoesIndisponiveis: number;
  motivosVariacao: string[];
}

export interface ShopeeMetricaDesempenho {
  /** Nome cru da Shopee (ex.: "late_shipment_rate") — a tradução é da camada
   *  de apresentação, não daqui. */
  nome: string;
  valor: number | null;
  valorAnterior: number | null;
  alvo: number | null;
  /** "<", "<=", ">", ">=" — quem define é a Shopee, por métrica. */
  comparador: string | null;
  ehPercentual: boolean;
  foraDaMeta: boolean;
}

export interface ShopeeDesempenhoLoja {
  /** Nota geral da Shopee, repassada sem tradução — ver obterDesempenhoLoja. */
  rating: number | null;
  falhasEntrega: number;
  falhasAnuncio: number;
  falhasAtendimento: number;
  metricas: ShopeeMetricaDesempenho[];
}

/** Aplica o comparador que a própria Shopee mandou. Sem valor ou sem alvo, não
 *  dá para afirmar que está fora — e "não sei" nunca deve virar alerta. */
function forcaDaMeta(valor: number | null, alvo: number | null, comparador?: string): boolean {
  if (valor === null || alvo === null || !comparador) return false;
  switch (comparador) {
    case "<": return !(valor < alvo);
    case "<=": return !(valor <= alvo);
    case ">": return !(valor > alvo);
    case ">=": return !(valor >= alvo);
    default: return false;
  }
}

type ShopeeStockInfo = {
  summary_info?: { total_available_stock?: number };
  seller_stock?: Array<{ stock?: number }>;
};

type ShopeePriceInfo = Array<{ current_price?: number; original_price?: number }>;

function saldoDoEstoque(stockInfo?: ShopeeStockInfo): number {
  if (typeof stockInfo?.summary_info?.total_available_stock === "number") return stockInfo.summary_info.total_available_stock;
  return stockInfo?.seller_stock?.reduce((total, s) => total + Number(s.stock ?? 0), 0) ?? 0;
}

// current_price já reflete promoção ativa; cai pro original_price quando
// não há price_info nenhum (item sem preço configurado é caso raro, mas
// não pode quebrar a importação inteira por causa disso).
/** Preço do anúncio, ou null quando a Shopee não informou nenhum. */
function precoOuNulo(priceInfo?: ShopeePriceInfo): string | null {
  const info = priceInfo?.[0];
  const valor = info?.current_price ?? info?.original_price ?? null;
  return valor === null || valor === undefined ? null : String(valor);
}

function precoDoItem(priceInfo?: ShopeePriceInfo): string {
  const info = priceInfo?.[0];
  return String(info?.current_price ?? info?.original_price ?? 0);
}

/** Chave usada pra casar um item de pedido com o produto já importado.
 *
 *  Precisa bater com o que `importar-catalogo.service.ts` gravou: lá o SKU do
 *  produto é `externalSku` quando o anúncio tem um, senão um SKU sintético
 *  `shopee-{item_id}[-{model_id}]`. Vendedor que não preenche SKU na Shopee
 *  (comum) fazia o pedido chegar com `skuExterno: ""`, reprovado na validação
 *  da ingestão ("expected string to have >=1 characters") — erro real em
 *  produção em 25/08/2026, com os pedidos já vindo certos da Shopee.
 *
 *  Ordem igual à do catálogo: model_sku (variação) → item_sku (anúncio) →
 *  sintético. `model_id` vem 0 em anúncio sem variação, mesmo caso em que o
 *  catálogo grava `variationId: null` e não sufixa o SKU gerado. */
export function skuDoItemPedido(item: {
  item_id?: number;
  model_id?: number;
  item_sku?: string;
  model_sku?: string;
}): string {
  const informado = item.model_sku?.trim() || item.item_sku?.trim();
  if (informado) return informado;
  const sufixoVariacao = item.model_id ? `-${item.model_id}` : "";
  return `shopee-${item.item_id ?? ""}${sufixoVariacao}`;
}

/** Item e pedido como voltam de `get_order_detail` — antes eram tipos locais
 *  da função que lia a resposta; subiram para cá porque a leitura passou a ser
 *  feita em lotes, em mais de um ponto. */
type ShopeeItem = {
  item_id?: number;
  model_id?: number;
  item_sku?: string;
  model_sku?: string;
  /** Nome do anúncio, já incluso em `item_list` — serve para criar o produto
   *  quando o pedido chega de um anúncio que o catálogo não conhece. */
  item_name?: string;
  model_quantity_purchased: number;
  model_discounted_price: number;
};

type ShopeeDetail = {
  order_sn: string;
  order_status?: string;
  buyer_username?: string;
  total_amount?: number;
  create_time?: number;
  recipient_address?: { name: string; phone?: string };
  item_list?: ShopeeItem[];
};

export type ShopeeOrderIncome = {
  escrow_amount?: number;
  buyer_total_amount?: number;
  voucher_from_seller?: number;
  voucher_from_shopee?: number;
  coins?: number;
  payment_promotion?: number;
  buyer_paid_shipping_fee?: number;
  buyer_transaction_fee?: number;
  cross_border_tax?: number;
  commission_fee?: number;
  service_fee?: number;
  seller_transaction_fee?: number;
  seller_coin_cash_back?: number;
  escrow_tax?: number;
  campaign_fee?: number;
  order_ams_commission_fee?: number;
  reverse_shipping_fee?: number;
  rsf_seller_protection_fee_premium_amount?: number;
  delivery_seller_protection_fee_premium_amount?: number;
  final_product_protection?: number;
};

export interface ShopeeFinanceiroNormalizado {
  total?: string;
  frete: string;
  desconto: string;
  acrescimo: string;
  valorLiquido?: string;
  taxasMarketplace: string[];
}

function valorFinanceiro(valor: unknown): number {
  const numero = Number(valor ?? 0);
  return Number.isFinite(numero) ? numero : 0;
}

function dinheiroApi(valor: number): string {
  return (Math.round((valor + Number.EPSILON) * 100) / 100).toFixed(2);
}

/** Converte o demonstrativo financeiro da Shopee para o contrato interno.
 *
 * `get_order_detail` traz os itens, mas não traz o repasse. Os campos abaixo
 * vêm de `payment/get_escrow_detail_batch`: frete pago no checkout, descontos
 * de checkout, tarifas cobradas do vendedor e o `escrow_amount` (líquido real).
 * A taxa é distribuída entre os itens apenas porque o schema legado a guarda
 * em `pedido_item`; o rateio em centavos preserva exatamente o total da API. */
export function normalizarFinanceiroShopee(
  income: ShopeeOrderIncome | undefined,
  itens: Array<{ model_quantity_purchased?: number; model_discounted_price?: number }>,
): ShopeeFinanceiroNormalizado | undefined {
  if (!income) return undefined;

  const taxaTotal = [
    income.commission_fee,
    income.service_fee,
    income.seller_transaction_fee,
    income.seller_coin_cash_back,
    income.escrow_tax,
    income.campaign_fee,
    income.order_ams_commission_fee,
    income.reverse_shipping_fee,
    income.rsf_seller_protection_fee_premium_amount,
    income.delivery_seller_protection_fee_premium_amount,
  ].reduce<number>((total, valor) => total + valorFinanceiro(valor), 0);

  const pesos = itens.map((item) => Math.max(
    0,
    valorFinanceiro(item.model_discounted_price) * valorFinanceiro(item.model_quantity_purchased),
  ));
  const pesoTotal = pesos.reduce((total, peso) => total + peso, 0);
  const taxaCentavos = Math.round(taxaTotal * 100);
  let centavosRestantes = taxaCentavos;
  const taxasMarketplace = pesos.map((peso, indice) => {
    const centavos = indice === pesos.length - 1
      ? centavosRestantes
      : Math.min(centavosRestantes, Math.round(taxaCentavos * (pesoTotal > 0 ? peso / pesoTotal : 1 / Math.max(itens.length, 1))));
    centavosRestantes -= centavos;
    return dinheiroApi(centavos / 100);
  });

  const desconto = [
    income.voucher_from_seller,
    income.voucher_from_shopee,
    income.coins,
    income.payment_promotion,
  ].reduce<number>((total, valor) => total + valorFinanceiro(valor), 0);
  const acrescimo = [
    income.buyer_transaction_fee,
    income.cross_border_tax,
    income.final_product_protection,
  ].reduce<number>((total, valor) => total + valorFinanceiro(valor), 0);

  return {
    total: income.buyer_total_amount == null ? undefined : dinheiroApi(valorFinanceiro(income.buyer_total_amount)),
    frete: dinheiroApi(valorFinanceiro(income.buyer_paid_shipping_fee)),
    desconto: dinheiroApi(desconto),
    acrescimo: dinheiroApi(acrescimo),
    valorLiquido: income.escrow_amount == null ? undefined : dinheiroApi(valorFinanceiro(income.escrow_amount)),
    taxasMarketplace,
  };
}

// O app "Elisa Lima CRM" (Product Management) não tem permissão pra API de
// Pedidos — confirmado em produção em 24/08/2026 com erro real da Shopee:
// error_api_permission, "This app type has no permission to this API". Essa
// API pertence à categoria Order Management, que é o app "Elisa Lima
// Pedidos" — aprovado pela Shopee em 25/08/2026 (Go Live concluído).
//
// Liberado de novo em 25/08/2026: buscarPedidos()/urlPedidos() agora assinam
// com as credenciais do app Pedidos (obterShopeeAppCredenciais("pedidos") +
// token OAuth próprio em canal_tokens, canal "shopee_pedidos" — ver
// criarShopeeProvider). Se uma marca ainda não autorizou esse app (sem token
// salvo), a chamada falha na hora (urlPedidos lança erro) em vez de bater na
// Shopee com credencial errada — não precisa deste freio global pra isso.
//
// Reverter pra `false` só se a Shopee suspender/revogar o app de novo.
export const SHOPEE_PEDIDOS_LIBERADO = true;

// PAUSA MANUAL (pedido do usuário, 25/08/2026): nenhuma chamada de rede deve
// sair pra Shopee por enquanto — catálogo, avaliações, saldo, health check.
// Pedidos já estavam travados à parte (SHOPEE_PEDIDOS_LIBERADO acima); isto
// aqui cobre o resto. Checado dentro de cada método que de fato chama
// `shopeeFetch`, não em `criarShopeeProvider`: aquele só lê token do banco
// (não é rede), travar ali faria a Central de Sincronização e o painel de
// saúde mostrarem a conta como "desconectada" — errado, ela continua
// conectada, só estamos escolhendo não usar por enquanto. Reverter: virar
// `false` de novo.
export const SHOPEE_REQUISICOES_PAUSADAS = false;

class ErroShopeePausado extends Error {
  constructor() {
    super("Requisições à Shopee pausadas manualmente — ver SHOPEE_REQUISICOES_PAUSADAS.");
    this.name = "ErroShopeePausado";
  }
}

function garantirNaoPausado(): void {
  if (SHOPEE_REQUISICOES_PAUSADAS) throw new ErroShopeePausado();
}

/** Envelope do get_escrow_detail_batch.
 *
 *  `response` é um ARRAY de `{ escrow_detail: { order_sn, order_income } }` —
 *  conferido ao vivo em 28/08/2026 contra a conta WUWU. NÃO existe o campo
 *  `order_income_list` que este código lia antes: era o formato do endpoint
 *  individual, presumido igual para o lote. Enquanto o escrow respondeu 403
 *  por permissão o erro ficou invisível — quando a permissão chegasse, o lote
 *  voltaria 200 e vazio, e o financeiro seguiria em branco sem nenhum erro
 *  para investigar. Exportado porque o webhook consome o mesmo endpoint e
 *  precisa concordar com esta forma. */
export function extrairIncomePorPedido(
  corpo: unknown,
): Map<string, ShopeeOrderIncome> {
  const resultado = new Map<string, ShopeeOrderIncome>();
  const resposta = (corpo as { response?: unknown })?.response;
  /* Aceita as duas formas por segurança: o array de escrow_detail que a
     Shopee devolve hoje e o antigo order_income_list, caso alguma conta ou
     versão da API ainda responda assim. */
  const lista = Array.isArray(resposta)
    ? resposta
    : (resposta as { order_income_list?: unknown[] })?.order_income_list ?? [];
  for (const bruto of lista) {
    const item = (bruto as { escrow_detail?: unknown }).escrow_detail ?? bruto;
    const { order_sn: orderSn, order_income: income } = (item ?? {}) as {
      order_sn?: string;
      order_income?: ShopeeOrderIncome;
    };
    if (orderSn && income) resultado.set(orderSn, income);
  }
  return resultado;
}

export class ShopeeProvider implements ChannelProvider {
  private readonly host = obterShopeeBaseUrl();
  private creds: ShopeeCredentials;
  // App "Elisa Lima Pedidos" (Order Management) — autorização OAuth própria,
  // shop_id/access_token diferentes dos do app "Elisa Lima CRM" (Product
  // Management, usado por `creds` no resto do provider), porque a Shopee
  // autoriza por APP, não só por loja: mesma loja pode conceder acesso pra
  // dois apps diferentes, cada autorização gera seu próprio access_token.
  // Opcional porque nem toda marca vai ter o app de Pedidos conectado ainda
  // — ver SHOPEE_PEDIDOS_LIBERADO.
  private credsPedidos?: ShopeeCredentials;
  // App "Elisa Lima Financeiro" (Accounting And Finance) — a API de Payment
  // (get_escrow_detail*) pertence a ESSA categoria, não à de Order Management.
  // Assinar o escrow com o app de Pedidos devolvia 403 error_api_permission em
  // 100% das chamadas; ver buscarFinanceiroPedidos(). Autorização própria,
  // logo access_token próprio, ainda que a loja seja a mesma.
  private credsFinanceiro?: ShopeeCredentials;
  // Uma coleta pode pedir várias variações do mesmo anúncio. Todas usam o
  // mesmo get_model_list; compartilhar a Promise evita pagar a mesma chamada
  // uma vez por SKU durante a própria execução.
  private readonly modelosPorItem = new Map<number, Promise<Array<{
    model_id: number;
    model_sku?: string;
    price_info?: ShopeePriceInfo;
    stock_info_v2?: ShopeeStockInfo;
  }>>>();

  constructor(
    creds: ShopeeCredentials,
    credsPedidos?: ShopeeCredentials,
    credsFinanceiro?: ShopeeCredentials,
  ) {
    this.creds = creds;
    this.credsPedidos = credsPedidos;
    this.credsFinanceiro = credsFinanceiro;
  }

  // A Shopee assina o CAMINHO COMPLETO da chamada (com /api/v2), o mesmo que
  // connect/route.ts e callback/route.ts já usam ("/api/v2/shop/auth_partner",
  // "/api/v2/auth/token/get"). Assinar só o sufixo (ex.: "/shop/get_shop_info",
  // sem o /api/v2) gera uma sign que não bate com a URL de fato chamada — a
  // Shopee aceita a chamada, mas rejeita com 403 "Wrong sign" silencioso (sem
  // reprovar a request em si, só a assinatura), então nenhum request feito
  // por este provider — get_shop_info, get_order_list, update_stock, etc. —
  // jamais funcionou até este fix, mesmo com token válido.
  private assinar(apiPath: string, timestamp: number, creds: ShopeeCredentials): string {
    const base = `${creds.partnerId}${apiPath}${timestamp}${creds.accessToken}${creds.shopId}`;
    return crypto.createHmac("sha256", creds.partnerKey).update(base).digest("hex");
  }

  private url(path: string, params: Record<string, string | number> = {}, creds: ShopeeCredentials = this.creds): string {
    const apiPath = `/api/v2${path}`;
    const ts = Math.floor(Date.now() / 1000);
    const sign = this.assinar(apiPath, ts, creds);
    const qs = new URLSearchParams({
      partner_id: creds.partnerId,
      shop_id: creds.shopId,
      access_token: creds.accessToken,
      timestamp: String(ts),
      sign,
      ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
    });
    return `${this.host}${apiPath}?${qs}`;
  }

  /** Pedidos assina com o par + token do app "Elisa Lima Pedidos", não o de
   *  catálogo — são apps diferentes na Shopee, autorização (e portanto
   *  access_token) não é intercambiável entre eles. */
  private urlPedidos(path: string, params: Record<string, string | number> = {}): string {
    if (!this.credsPedidos) {
      throw new Error("App Shopee Pedidos não conectado para esta marca (ver SHOPEE_PARTNER_ID_PEDIDOS_* e OAuth em /configuracoes).");
    }
    return this.url(path, params, this.credsPedidos);
  }

  /** A API de Payment assina com o par + token do app "Elisa Lima Financeiro"
   *  (categoria Accounting And Finance). É o mesmo motivo de urlPedidos: a
   *  Shopee autoriza por APP e libera cada categoria de API só para o app
   *  dono dela. */
  private urlFinanceiro(path: string, params: Record<string, string | number> = {}): string {
    if (!this.credsFinanceiro) {
      throw new Error("App Shopee Financeiro não conectado para esta marca (ver SHOPEE_PARTNER_ID_FINANCEIRO_* e OAuth em /configuracoes).");
    }
    return this.url(path, params, this.credsFinanceiro);
  }

  // get_order_list rejeita qualquer janela (time_to - time_from) maior que
  // 15 dias — "Start time must be earlier than end time and diff in 15days."
  // Achado em produção em 25/08/2026: a sincronização manual pede 90 dias de
  // uma vez (ver A31-sincronizar-conta.ts) e falhava 100% das vezes. Aqui
  // fatiamos o intervalo pedido em janelas de até 15 dias e concatenamos.
  private static readonly JANELA_MAX_PEDIDOS_MS = 15 * 24 * 60 * 60 * 1000;

  /** As janelas de até 15 dias que cobrem o intervalo pedido.
   *
   *  Público porque quem chama precisa poder buscar UMA janela por vez: na
   *  sincronização manual (A31) as 90 dias inteiras rodavam dentro de um
   *  único `step.run` do Inngest, e numa loja com volume — a WUWU, 208
   *  pedidos em 90 dias — isso não cabia nos 300s de `maxDuration`. O step
   *  estourava, o Inngest reexecutava do zero, e a execução ficava presa em
   *  `em_andamento` para sempre, travando os módulos seguintes (Anúncios,
   *  Avaliações, Termômetro nunca saíam de `pendente`). Pior: o step único
   *  existia justamente para a memoização evitar repetir chamadas ao canal —
   *  mas memoização só vale para step que TERMINA, então o remédio virou a
   *  doença e o laço queimava a cota do proxy que queria poupar.
   *
   *  Uma janela por step: cada pedaço cabe no orçamento, conclui e fica
   *  memoizado de verdade. */
  // `Date.now()`, não `new Date()`: o relógio é mockado com
  // `vi.spyOn(Date, "now")` nos testes de contrato do provider, e `new Date()`
  // ignora esse spy — passaria a fatiar pelo relógio real e a gerar janelas
  // que o teste não espera.
  janelasDePedidos(desde: Date, ate: Date = new Date(Date.now())): Array<{ inicioMs: number; fimMs: number }> {
    const fim = ate.getTime();
    const janelas: Array<{ inicioMs: number; fimMs: number }> = [];
    let inicioJanela = desde.getTime();
    while (inicioJanela < fim) {
      const fimJanela = Math.min(inicioJanela + ShopeeProvider.JANELA_MAX_PEDIDOS_MS, fim);
      janelas.push({ inicioMs: inicioJanela, fimMs: fimJanela });
      inicioJanela = fimJanela;
    }
    return janelas;
  }

  /** Uma janela só — ver `janelasDePedidos`. */
  async buscarPedidosDaJanela(
    inicioMs: number,
    fimMs: number,
    opcoes: OpcoesBuscaPedidos = {},
  ): Promise<PedidoNormalizado[]> {
    return this.buscarPedidosJanela(inicioMs, fimMs, opcoes);
  }

  async buscarPedidos(desde: Date, opcoes: OpcoesBuscaPedidos = {}): Promise<PedidoNormalizado[]> {
    const pedidos: PedidoNormalizado[] = [];
    for (const { inicioMs, fimMs } of this.janelasDePedidos(desde)) {
      pedidos.push(...await this.buscarPedidosJanela(inicioMs, fimMs, opcoes));
    }
    return pedidos;
  }

  /** Tamanho de página do get_order_list. A Shopee aceita até 100; 50 é o que
   *  já rodava em produção e mantém a chamada de detalhe (teto de 50 por
   *  chamada) alinhada a uma página. */
  private static readonly PAGINA_PEDIDOS = 50;
  /** get_order_detail aceita no máximo 50 order_sn por chamada. */
  private static readonly LOTE_DETALHE_PEDIDOS = 50;
  /** Trava contra `more: true` eterno — 200 páginas são 10 mil pedidos numa
   *  janela de 15 dias, muito além de qualquer volume real destas contas. */
  private static readonly MAX_PAGINAS_PEDIDOS = 200;

  /** Lista os order_sn da janela seguindo a paginação por cursor.
   *
   *  Antes esta chamada era única, com `page_size: 50` e sem olhar `more` /
   *  `next_cursor`: qualquer janela com mais de 50 pedidos perdia o excedente
   *  em silêncio — e a janela é de 15 dias, com dias de 23 pedidos numa marca
   *  só (09/08/2026). Pedido que não entra aqui não é sincronizado nunca mais,
   *  porque as sincronizações seguintes pedem janelas mais recentes. */
  private async listarOrderSnsDaJanela(
    timeFrom: number,
    timeTo: number,
  ): Promise<Array<{ providerOrderId: string; statusExterno: string }>> {
    const sns: Array<{ providerOrderId: string; statusExterno: string }> = [];
    let cursor = "";

    for (let pagina = 0; pagina < ShopeeProvider.MAX_PAGINAS_PEDIDOS; pagina++) {
      // get_order_list devolve só order_sn/order_status — os demais campos do
      // pedido (buyer_username, total_amount, create_time) NÃO são aceitos aqui
      // em response_optional_fields; a Shopee responde "Wrong parameters,
      // response_optional_field does not support [buyer_username]" e a chamada
      // inteira falha. Todo o resto vem do get_order_detail.
      const listRes = await shopeeFetch(this.urlPedidos("/order/get_order_list", {
        time_range_field: "create_time",
        time_from: timeFrom,
        time_to: timeTo,
        page_size: ShopeeProvider.PAGINA_PEDIDOS,
        ...(cursor ? { cursor } : {}),
      }), { signal: AbortSignal.timeout(10000) });

      if (!listRes.ok) {
        const detalhe = (await listRes.text().catch(() => "")).replace(/[\r\n]+/g, " ").slice(0, 240);
        throw new Error(`Shopee HTTP ${listRes.status} em get_order_list: ${detalhe}`);
      }
      const listData = await listRes.json() as {
        error?: string;
        message?: string;
        response?: {
          order_list?: { order_sn: string; order_status?: string }[];
          more?: boolean;
          next_cursor?: string;
        };
      };
      if (listData.error) throw new Error(`Shopee get_order_list: ${listData.message ?? listData.error}`);

      /* O status vem de graça nesta listagem e é o que permite decidir, sem
         gastar mais nenhuma chamada, se o pedido mudou de estágio desde a
         última vez que foi lido. */
      sns.push(...(listData.response?.order_list ?? []).map((order) => ({
        providerOrderId: order.order_sn,
        statusExterno: order.order_status ?? "",
      })));

      const proximoCursor = listData.response?.next_cursor ?? "";
      // Cursor repetido significaria pedir a mesma página para sempre.
      if (!listData.response?.more || !proximoCursor || proximoCursor === cursor) return sns;
      cursor = proximoCursor;
    }

    throw new Error(`Shopee get_order_list continuou paginando após ${ShopeeProvider.MAX_PAGINAS_PEDIDOS} páginas.`);
  }

  private async buscarPedidosJanela(
    inicioMs: number,
    fimMs: number,
    opcoes: OpcoesBuscaPedidos = {},
  ): Promise<PedidoNormalizado[]> {
    const timeFrom = Math.floor(inicioMs / 1000);
    const timeTo = Math.floor(fimMs / 1000);

    const candidatos = await this.listarOrderSnsDaJanela(timeFrom, timeTo);
    if (candidatos.length === 0) return [];

    /* Só o que ainda tem algo a aprender segue para o detalhe. A listagem
       acima já custou a chamada; o caro são as duas seguintes (detalhe e
       repasse), e numa janela de contingência a maioria dos pedidos já está
       gravada e liquidada. Sem filtro, o comportamento é o de antes. */
    const sns = opcoes.filtrarPendentes
      ? await opcoes.filtrarPendentes(candidatos)
      : candidatos.map((item) => item.providerOrderId);
    if (sns.length === 0) return [];

    // Detalhes em lotes de 50 — com a paginação acima, uma janela cheia passa
    // fácil desse teto e a chamada inteira falharia se mandasse tudo de uma vez.
    const detailMap = new Map<string, ShopeeDetail>();
    for (let inicio = 0; inicio < sns.length; inicio += ShopeeProvider.LOTE_DETALHE_PEDIDOS) {
      const lote = sns.slice(inicio, inicio + ShopeeProvider.LOTE_DETALHE_PEDIDOS);
      const detailRes = await shopeeFetch(this.urlPedidos("/order/get_order_detail", {
        order_sn_list: lote.join(","),
        response_optional_fields: "item_list,recipient_address,buyer_user_id,buyer_username,total_amount",
      }), { signal: AbortSignal.timeout(15000) });

      if (!detailRes.ok) {
        const detalhe = (await detailRes.text().catch(() => "")).replace(/[\r\n]+/g, " ").slice(0, 240);
        throw new Error(`Shopee HTTP ${detailRes.status} em get_order_detail: ${detalhe}`);
      }
      const detailData = await detailRes.json() as { error?: string; message?: string; response?: { order_list?: ShopeeDetail[] } };
      if (detailData.error) throw new Error(`Shopee get_order_detail: ${detailData.message ?? detailData.error}`);
      for (const d of detailData.response?.order_list ?? []) {
        detailMap.set(d.order_sn, d);
      }
    }

    const detalhesAusentes = sns.filter((sn) => !detailMap.has(sn));
    if (detalhesAusentes.length > 0) {
      throw new Error(`Shopee não retornou detalhes de ${detalhesAusentes.length} pedido(s).`);
    }

    const financeiroMap = await this.buscarFinanceiroPedidos(sns);

    return sns.map((sn) => {
      const detail = detailMap.get(sn);
      const comprador = detail?.buyer_username ?? sn;
      const financeiro = normalizarFinanceiroShopee(financeiroMap.get(sn), detail?.item_list ?? []);
      return {
        providerOrderId: sn,
        canal: "shopee",
        clienteExternalId: comprador,
        clienteNome: detail?.recipient_address?.name ?? comprador,
        clienteTelefone: detail?.recipient_address?.phone,
        status: (detail?.order_status ?? "").toLowerCase(),
        total: financeiro?.total ?? String(detail?.total_amount ?? 0),
        frete: financeiro?.frete,
        desconto: financeiro?.desconto,
        acrescimo: financeiro?.acrescimo,
        valorLiquido: financeiro?.valorLiquido,
        itens: (detail?.item_list ?? []).map((i, indice) => ({
          skuExterno: skuDoItemPedido(i),
          quantidade: i.model_quantity_purchased,
          precoUnitario: String(i.model_discounted_price),
          taxaMarketplace: financeiro?.taxasMarketplace[indice],
          // O anúncio da venda — ver o comentário em `PedidoNormalizado.itens`.
          // Mesma régua do catálogo: `model_id` 0 significa anúncio sem
          // variação, e ali o vínculo grava null.
          listingId: i.item_id ? String(i.item_id) : undefined,
          variationId: i.model_id ? String(i.model_id) : null,
          titulo: i.item_name,
        })),
        criadoEm: new Date((detail?.create_time ?? 0) * 1000),
      };
    });
  }

  /** 401/403, ou a Shopee dizendo em texto que o app não tem permissão para a
   *  categoria — o `error_api_permission` que ela devolve com HTTP 403 (mesmo
   *  erro que já barrava o app de catálogo na API de Pedidos). Não é falha
   *  daquele pedido nem instabilidade: repetir não muda o resultado. */
  private static ehFalhaDeAutorizacao(error: unknown): boolean {
    return /HTTP (401|403)|permission|auth/i.test(String(error));
  }

  /** Busca o financeiro em lotes recomendados de até 20 pedidos. Falha desse
   * endpoint não pode apagar o pedido operacional: pedidos novos ou ainda não
   * pagos às vezes não têm escrow disponível. A reconciliação periódica tenta
   * novamente e preenche os valores assim que a Shopee os liberar.
   *
   * HISTÓRICO — este endpoint respondeu 403 em 100% das chamadas até 28/08/2026
   * (495 em `get_escrow_detail_batch` e 494 em `get_escrow_detail` em sete
   * dias), enquanto `get_order_list` do MESMO app respondia 200. Nunca foi bug
   * de código: a API de Payment pertence à categoria Accounting And Finance, e
   * o app "Elisa Lima Pedidos" é Order Management. A correção foi assinar com
   * o app "Elisa Lima Financeiro" (urlFinanceiro abaixo), aprovado pela Shopee
   * e autorizado pelas duas marcas em 28/08/2026 — conferido ao vivo: 200 e
   * `escrow_amount` real nos dois endpoints.
   *
   * Os pedidos já gravados em branco não precisam de reimportação manual:
   * `reconciliarFinanceiroPedido` (ingestao-pedido.service.ts) preenche frete,
   * desconto, acréscimo, `valor_liquido` e a taxa por item na próxima passada
   * da A34. Marca sem o app financeiro conectado continua caindo no aviso de
   * `semPermissaoFinanceira` — sem token, urlFinanceiro lança e o pedido entra
   * sem financeiro, como antes, em vez de derrubar a sincronização. */
  private async buscarFinanceiroPedidos(orderSns: string[]): Promise<Map<string, ShopeeOrderIncome>> {
    const resultado = new Map<string, ShopeeOrderIncome>();
    /* Marca sem o app Financeiro autorizado: sair aqui, antes de qualquer
       rede. Deixar urlFinanceiro() lançar dentro do laço custaria uma volta
       por lote e, no fallback, uma por pedido — todas fadadas ao mesmo erro,
       queimando a cota do proxy de IP fixo, que é o gargalo real. */
    if (!this.credsFinanceiro) {
      console.warn(
        `[Shopee] app Financeiro não conectado para esta marca — ${orderSns.length} pedido(s) entram sem `
        + "repasse, frete e taxa. Autorizar em /configuracoes; a A34 preenche depois, sem reimportação.",
      );
      return resultado;
    }
    let semPermissaoFinanceira = false;
    for (let inicio = 0; inicio < orderSns.length; inicio += 20) {
      const lote = orderSns.slice(inicio, inicio + 20);
      try {
        const res = await shopeeFetch(this.urlFinanceiro("/payment/get_escrow_detail_batch"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order_sn_list: lote }),
          signal: AbortSignal.timeout(15000),
        });
        const data = await res.json() as { error?: string; message?: string };
        if (!res.ok || data.error) {
          throw new Error(`HTTP ${res.status}: ${data.message ?? data.error ?? "resposta financeira recusada"}`);
        }
        for (const [orderSn, income] of extrairIncomePorPedido(data)) {
          resultado.set(orderSn, income);
        }
      } catch (error) {
        /* Autorização negada no lote também nega no individual — é o mesmo app
           e a mesma categoria de API. Tentar um a um aqui só multiplicava por
           20 as chamadas condenadas. O retry individual continua valendo para
           o que ele foi feito: lote que falhou por um pedido sem escrow ainda
           liberado, onde os outros 19 têm. */
        if (ShopeeProvider.ehFalhaDeAutorizacao(error)) {
          semPermissaoFinanceira = true;
        } else {
          console.warn(`[Shopee] financeiro em lote indisponível para ${lote.length} pedido(s); tentando endpoint individual:`, error);
          for (const orderSn of lote) {
            try {
              const res = await shopeeFetch(this.urlFinanceiro("/payment/get_escrow_detail", { order_sn: orderSn }), {
                signal: AbortSignal.timeout(10000),
              });
              const data = await res.json() as {
                error?: string;
                message?: string;
                response?: { order_sn?: string; order_income?: ShopeeOrderIncome };
              };
              if (!res.ok || data.error) {
                throw new Error(`HTTP ${res.status}: ${data.message ?? data.error ?? "resposta financeira recusada"}`);
              }
              if (data.response?.order_income) {
                resultado.set(data.response.order_sn ?? orderSn, data.response.order_income);
              }
            } catch (individualError) {
              console.warn(`[Shopee] financeiro individual indisponível para ${orderSn}:`, individualError);
              // 401/403 é falha de autorização do app, não do pedido. Repetir a
              // mesma chamada para o restante do lote só gastaria Webshare.
              if (ShopeeProvider.ehFalhaDeAutorizacao(individualError)) {
                semPermissaoFinanceira = true;
                break;
              }
            }
          }
        }
      }
      /* Autorização negada vale para o app inteiro, não para aquele lote: os
         próximos lotes vão receber o mesmo 403. Antes o laço seguia mesmo
         assim e cada sincronização gastava duas chamadas por lote em algo que
         não tinha como dar certo — em sete dias foram 989 chamadas 403, todas
         consumindo a cota do proxy de IP fixo, que é o gargalo real aqui. */
      if (semPermissaoFinanceira) {
        console.warn(
          "[Shopee] app sem permissão para a API de Payment — financeiro dos pedidos "
          + `não será preenchido nesta volta (${orderSns.length - inicio - lote.length} pedido(s) restantes pulados). `
          + "Liberar a categoria Payment/Finance para o app de Pedidos no console da Shopee.",
        );
        break;
      }
    }
    return resultado;
  }

  async sincronizarEstoque(referencia: EstoqueCanalRef, saldo: number): Promise<void> {
    garantirNaoPausado();
    const item = referencia.skuId
      ? { item_id: Number(referencia.listingId), model_list: [{ model_id: Number(referencia.skuId), normal_stock: saldo }] }
      : { item_id: Number(referencia.listingId), normal_stock: saldo };
    const res = await shopeeFetch(this.url("/product/update_stock"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_list: [item] }),
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json().catch(() => null) as { error?: string; message?: string } | null;
    if (!res.ok || data?.error) {
      throw new Error(`Shopee sync estoque falhou para anúncio ${referencia.listingId}: ${data?.message ?? data?.error ?? `HTTP ${res.status}`}`);
    }
  }

  async consultarEstoque(referencia: EstoqueCanalRef): Promise<number> {
    garantirNaoPausado();
    const modelosDoItem = await this.listarModelosItem(Number(referencia.listingId));
    const modelos = modelosDoItem.filter((modelo) => !referencia.skuId || String(modelo.model_id) === referencia.skuId);
    if (referencia.skuId && modelos.length === 0) {
      throw new Error(`Shopee não retornou o modelo ${referencia.skuId} do anúncio ${referencia.listingId}.`);
    }
    const saldo = modelos.reduce((total, modelo) => {
      const temEstoqueV2 = Boolean(
        modelo.stock_info_v2?.summary_info
        || modelo.stock_info_v2?.seller_stock,
      );
      return total + (temEstoqueV2
        ? saldoDoEstoque(modelo.stock_info_v2)
        : Number(modelo.normal_stock ?? 0));
    }, 0);
    if (!Number.isInteger(saldo) || saldo < 0) {
      throw new Error(`Shopee retornou saldo inválido para anúncio ${referencia.listingId}.`);
    }
    return saldo;
  }

  /** Todos os itens ativos (à venda) da loja, paginados por offset — a
   *  Shopee só devolve 100 por página. Necessário porque `get_comment` (ver
   *  `listarAvaliacoes`) só lista quem TEM comentário; sem este catálogo,
   *  um anúncio nunca avaliado nunca apareceria nem como "sem avaliação",
   *  simplesmente sumiria da tela inteira. */
  private async listarItemIdsAtivos(): Promise<number[]> {
    const itemIds: number[] = [];
    let offset = 0;
    for (let pagina = 0; pagina < 20; pagina++) {
      const res = await shopeeFetch(this.url("/product/get_item_list", {
        offset,
        page_size: 100,
        item_status: "NORMAL",
      }), { signal: AbortSignal.timeout(10000) });

      if (!res.ok) {
        const detalhe = (await res.text().catch(() => "")).replace(/[\r\n]+/g, " ").slice(0, 240);
        throw new Error(`Shopee HTTP ${res.status} em get_item_list: ${detalhe}`);
      }
      const data = await res.json() as {
        error?: string;
        message?: string;
        response?: { item?: Array<{ item_id: number }>; next_offset?: number; has_next_page?: boolean };
      };
      if (data.error) throw new Error(`Shopee get_item_list: ${data.message ?? data.error}`);

      const lote = data.response?.item ?? [];
      itemIds.push(...lote.map((i) => i.item_id));
      if (!data.response?.has_next_page || lote.length === 0) break;
      offset = data.response.next_offset ?? offset + lote.length;
    }
    return itemIds;
  }

  /** Comentários/avaliações da loja inteira, paginados por cursor — a Shopee
   *  não devolve nota agregada por item como o ML devolve; a gente calcula
   *  aqui a partir dos comentários coletados (get_comment não exige item_id,
   *  lista a loja toda, diferente do ML que é 1 requisição por anúncio).
   *  Título do item vem de um get_item_base_info em lote, à parte.
   *
   *  Limite de 10 páginas (até 1000 comentários) por chamada — loja não vai
   *  ter mais que isso de comentário recente, e evita gastar cota do proxy
   *  à toa numa loja com histórico muito grande.
   *
   *  Comentário sozinho não basta: quem nunca foi avaliado também precisa
   *  aparecer (com nota nula) pra tela poder filtrar "sem avaliações" —
   *  por isso o catálogo ativo (`listarItemIdsAtivos`) entra no cruzamento. */
  /** Saúde da loja (o "Termômetro" da Shopee), de
   *  `account_health/get_shop_performance`.
   *
   *  Confirmado ao vivo em 25/08/2026 contra as duas lojas: o app de catálogo
   *  (Product Management) JÁ tem permissão nesse endpoint — diferente de
   *  `/ads/*`, que responde error_api_permission nos dois apps e exigiria um
   *  terceiro app aprovado pela Shopee.
   *
   *  Cada métrica vem com o próprio alvo (`target.value` + `target.comparator`),
   *  então "está fora da meta" é decidido pelo que a Shopee informa, sem tabela
   *  de limites nossa — ao contrário do Mercado Livre, onde os cortes são
   *  estimados (ver LIMITE_TAXA em reputacao.service.ts).
   *
   *  `overall_performance.rating` é repassado cru de propósito: a Shopee não
   *  publica o significado de cada número, e traduzir isso em "Bom/Ruim" seria
   *  invenção nossa. O sinal confiável são as métricas que furam o próprio
   *  alvo, e é isso que a tela usa. */
  async obterDesempenhoLoja(): Promise<ShopeeDesempenhoLoja> {
    garantirNaoPausado();
    const res = await shopeeFetch(this.url("/account_health/get_shop_performance"), {
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      const detalhe = (await res.text().catch(() => "")).replace(/[\r\n]+/g, " ").slice(0, 240);
      throw new Error(`Shopee HTTP ${res.status} em get_shop_performance: ${detalhe}`);
    }
    const data = await res.json() as {
      error?: string;
      message?: string;
      response?: {
        overall_performance?: {
          rating?: number;
          fulfillment_failed?: number;
          listing_failed?: number;
          custom_service_failed?: number;
        };
        metric_list?: Array<{
          metric_name?: string;
          current_period?: number | null;
          last_period?: number | null;
          unit?: number;
          target?: { value?: number | null; comparator?: string };
        }>;
      };
    };
    if (data.error) throw new Error(`Shopee get_shop_performance: ${data.message ?? data.error}`);

    const geral = data.response?.overall_performance ?? {};
    return {
      rating: geral.rating ?? null,
      falhasEntrega: geral.fulfillment_failed ?? 0,
      falhasAnuncio: geral.listing_failed ?? 0,
      falhasAtendimento: geral.custom_service_failed ?? 0,
      metricas: (data.response?.metric_list ?? []).map((m) => {
        const valor = typeof m.current_period === "number" ? m.current_period : null;
        const alvo = typeof m.target?.value === "number" ? m.target.value : null;
        return {
          nome: m.metric_name ?? "",
          valor,
          valorAnterior: typeof m.last_period === "number" ? m.last_period : null,
          alvo,
          comparador: m.target?.comparator ?? null,
          // unit 2 é percentual nos dados reais das duas lojas; qualquer outro
          // valor fica como "não sabemos a unidade" em vez de virar % errado.
          ehPercentual: m.unit === 2,
          foraDaMeta: forcaDaMeta(valor, alvo, m.target?.comparator),
        };
      }),
    };
  }

  async listarAvaliacoes(): Promise<ShopeeAnuncioAvaliacao[]> {
    garantirNaoPausado();
    /* A forma abaixo foi conferida contra a API ao vivo (28/08/2026), não
       deduzida da documentação: `get_comment` devolve onze campos por
       comentário. Os que ficaram de fora são `editable` (se o comprador
       ainda pode editar — não muda nada para quem vende), `model_id` e
       `model_id_list` (variação: vieram zerados em 125 de 125 comentários,
       então guardar seria guardar zero). `comment_reply` NÃO existe nesta
       resposta — quem quiser "avaliações sem resposta do vendedor" precisa
       de outro endpoint, não dá pra derivar daqui. */
    type ShopeeComentario = {
      comment_id?: number | string;
      item_id: number;
      order_sn?: string;
      comment?: string;
      rating_star?: number;
      create_time?: number;
      buyer_username?: string;
      hidden?: boolean;
      media?: { image_url_list?: string[]; video_url_list?: string[] };
    };

    const comentarios: ShopeeComentario[] = [];
    let cursor = "";
    for (let pagina = 0; pagina < 10; pagina++) {
      const res = await shopeeFetch(this.url("/product/get_comment", {
        cursor,
        page_size: 100,
      }), { signal: AbortSignal.timeout(10000) });

      if (!res.ok) {
        const detalhe = (await res.text().catch(() => "")).replace(/[\r\n]+/g, " ").slice(0, 240);
        throw new Error(`Shopee HTTP ${res.status} em get_comment: ${detalhe}`);
      }
      const data = await res.json() as {
        error?: string;
        message?: string;
        response?: { item_comment_list?: ShopeeComentario[]; next_cursor?: string; more?: boolean };
      };
      if (data.error) throw new Error(`Shopee get_comment: ${data.message ?? data.error}`);

      const lote = data.response?.item_comment_list ?? [];
      comentarios.push(...lote);
      if (!data.response?.more || lote.length === 0) break;
      cursor = data.response.next_cursor ?? "";
      if (!cursor) break;
    }

    const itemIdsAtivos = await this.listarItemIdsAtivos();
    if (itemIdsAtivos.length === 0 && comentarios.length === 0) return [];

    const itemIds = [...new Set([...itemIdsAtivos, ...comentarios.map((c) => c.item_id)])];
    const titulos = new Map<number, string>();
    for (let i = 0; i < itemIds.length; i += 50) {
      const lote = itemIds.slice(i, i + 50);
      const res = await shopeeFetch(this.url("/product/get_item_base_info", {
        item_id_list: lote.join(","),
        response_optional_fields: "item_name",
      }), { signal: AbortSignal.timeout(10000) });
      if (!res.ok) continue; // título é cosmético — não derruba a sincronização inteira por isso
      const data = await res.json().catch(() => null) as {
        response?: { item_list?: Array<{ item_id: number; item_name?: string }> };
      } | null;
      for (const item of data?.response?.item_list ?? []) {
        if (item.item_name) titulos.set(item.item_id, item.item_name);
      }
    }

    const porItem = new Map<number, ShopeeComentario[]>();
    for (const c of comentarios) {
      const lista = porItem.get(c.item_id) ?? [];
      lista.push(c);
      porItem.set(c.item_id, lista);
    }

    // União: item ativo sem comentário nenhum entra com lista vazia (nota
    // nula); item com comentário mas já fora do catálogo ativo (removido/
    // pausado) fica de fora — mesma regra que o ML aplica aos anúncios dele.
    const itemIdsResultado = itemIdsAtivos.length > 0
      ? itemIdsAtivos
      : [...porItem.keys()];

    return itemIdsResultado.map((itemId) => {
      const lista = porItem.get(itemId) ?? [];
      const notas = lista.map((c) => c.rating_star).filter((n): n is number => typeof n === "number" && n >= 1 && n <= 5);
      const ratingLevels: Record<string, number> = { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 };
      for (const n of notas) ratingLevels[String(n)] += 1;
      const ratingAverage = notas.length > 0 ? notas.reduce((a, b) => a + b, 0) / notas.length : null;

      return {
        itemId: String(itemId),
        title: titulos.get(itemId) ?? String(itemId),
        ratingAverage,
        reviewsTotal: lista.length,
        ratingLevels,
        // Sem corte de quantidade aqui de propósito, diferente do ML
        // (MAX_OPINIOES_POR_ANUNCIO): lá o corte existe porque a API só
        // devolve por padrão um punhado por vez (limit=5) e cortar depois
        // não economiza nada. Aqui o get_comment já paginou a loja inteira
        // por cursor antes de chegar neste ponto — o custo da chamada já foi
        // pago, então descartar comentário com texto depois seria perder
        // dado que já está em mãos sem motivo.
        /* Antes o filtro era `c.comment`: avaliação sem texto era jogada
           fora. Mas ela não é vazia — traz nota, autor, o pedido de origem e
           às vezes foto ou vídeo SEM uma palavra escrita. Em 125 comentários
           reais, só 22% (WUWU) e 40% (Armarinhos Lima) tinham texto; o resto
           contava para a média e não aparecia em lugar nenhum. Agora entra
           também a avaliação que só tem foto ou vídeo — que é conteúdo de
           verdade, e dos mais úteis.

           O corte continua existindo, e não é por `order_sn`: esse campo vem
           em 100% dos comentários, então filtrar por ele seria não filtrar
           nada e despejar na tela uma linha por estrela solta. Nota sem texto
           e sem mídia já está representada na média e na distribuição. */
        opinioes: lista
          .filter((c) => c.comment?.trim() || c.media?.image_url_list?.length || c.media?.video_url_list?.length)
          .sort((a, b) => (b.create_time ?? 0) - (a.create_time ?? 0))
          .map((c) => ({
            id: String(c.comment_id ?? `${itemId}-${c.create_time}`),
            titulo: null,
            conteudo: c.comment?.trim() ? c.comment : null,
            nota: c.rating_star ?? 0,
            criadaEm: c.create_time ? new Date(c.create_time * 1000).toISOString() : null,
            autor: c.buyer_username ?? null,
            pedidoCanal: c.order_sn ?? null,
            fotos: c.media?.image_url_list ?? [],
            videos: c.media?.video_url_list ?? [],
            oculta: c.hidden === true,
          })),
      };
    });
  }

  /** Variação real (preço/estoque por SKU) não vem no `get_item_base_info`
   *  — mesmo motivo pelo qual `consultarEstoque` já consulta esse endpoint
   *  à parte pra saldo. Reaproveita o mesmo endpoint, só que sem o filtro
   *  por `skuId` (aqui queremos todas as variações do item, não uma só). */
  private async listarModelosItem(itemId: number): Promise<Array<{
    model_id: number;
    model_sku?: string;
    price_info?: ShopeePriceInfo;
    stock_info_v2?: ShopeeStockInfo;
    normal_stock?: number;
  }>> {
    const existente = this.modelosPorItem.get(itemId);
    if (existente) return existente;
    const consulta = (async () => {
      const res = await shopeeFetch(this.url("/product/get_model_list", {
        item_id: itemId,
        response_optional_fields: "price_info,tier_index",
      }), { signal: AbortSignal.timeout(8000) });
      if (!res.ok) {
        const detalhe = (await res.text().catch(() => "")).replace(/[\r\n]+/g, " ").slice(0, 240);
        throw new Error(`Shopee HTTP ${res.status} em get_model_list: ${detalhe}`);
      }
      const data = await res.json() as {
        error?: string;
        message?: string;
        response?: { model?: Array<{ model_id: number; model_sku?: string; price_info?: ShopeePriceInfo; stock_info_v2?: ShopeeStockInfo; normal_stock?: number }> };
      };
      if (data.error) throw new Error(`Shopee get_model_list: ${data.message ?? data.error}`);
      return data.response?.model ?? [];
    })();
    this.modelosPorItem.set(itemId, consulta);
    try {
      return await consulta;
    } catch (error) {
      this.modelosPorItem.delete(itemId);
      throw error;
    }
  }

  /** Status, preço, foto e link dos anúncios informados — o equivalente
   *  Shopee do `consultarStatusAnuncios` do Mercado Livre, que a A5 já usa
   *  há tempos. Existe porque esses quatro campos apareciam preenchidos no
   *  Mercado Livre e vazios na Shopee em Estoque e Avaliações: não é que a
   *  Shopee não informe, é que ninguém estava perguntando (a chamada que já
   *  fazíamos pedia só `item_name`).
   *
   *  Uma chamada por lote de 50, o mesmo limite que `listarCatalogoAtivo`
   *  respeita. O status vem CRU ("NORMAL", "UNLIST", "BANNED", "DELETED") —
   *  traduzir é papel de quem exibe.
   *
   *  Anúncio que a Shopee não devolver simplesmente não aparece no resultado;
   *  quem chama trata ausência como "não sei agora", nunca como "encerrado".
   *
   *  O preço vem null quando o anúncio tem variação: nesse caso a Shopee só
   *  informa preço por SKU, num `get_model_list` por item — e é justamente a
   *  chamada cara que a coleta de saldo já raciona por causa da cota do proxy.
   *  Status, foto e link, que eram os campos ausentes nas telas, vêm sempre. */
  async consultarStatusAnuncios(itemIds: string[]): Promise<Record<string, {
    status: string | null;
    preco: string | null;
    imagem: string | null;
    permalink: string;
  }>> {
    garantirNaoPausado();
    const resultado: Record<string, { status: string | null; preco: string | null; imagem: string | null; permalink: string }> = {};
    const ids = [...new Set(itemIds.map((id) => id.trim()).filter(Boolean))];
    if (ids.length === 0) return resultado;

    type ItemComDetalhe = {
      item_id: number;
      item_status?: string;
      price_info?: ShopeePriceInfo;
      image?: { image_url_list?: string[] };
    };

    for (let i = 0; i < ids.length; i += 50) {
      const lote = ids.slice(i, i + 50);
      const res = await shopeeFetch(this.url("/product/get_item_base_info", {
        item_id_list: lote.join(","),
        response_optional_fields: "item_status,price_info,image",
      }), { signal: AbortSignal.timeout(10000) });
      // Lote que falha não derruba os outros: é uma coleta de enriquecimento,
      // e meia tela preenchida vale mais que uma execução abortada.
      if (!res.ok) continue;
      const data = await res.json().catch(() => null) as {
        error?: string;
        response?: { item_list?: ItemComDetalhe[] };
      } | null;
      if (!data || data.error) continue;

      for (const item of data.response?.item_list ?? []) {
        const itemId = String(item.item_id);
        resultado[itemId] = {
          status: item.item_status ?? null,
          // `precoDoItem` devolve "0" quando não há preço, o que serve pro
          // importador de catálogo mas não aqui: gravar zero como preço do
          // anúncio seria inventar um número. Ausente fica ausente.
          preco: precoOuNulo(item.price_info),
          imagem: item.image?.image_url_list?.[0] ?? null,
          permalink: urlProdutoShopee(this.creds.shopId, itemId),
        };
      }
    }

    return resultado;
  }

  /** Catálogo inteiro da loja (ativo à venda), pro importador do Estoque —
   *  equivalente Shopee do `listarAnunciosAtivos` do Mercado Livre. Reusa
   *  `listarItemIdsAtivos` (já existente pra Avaliações) pra descobrir os
   *  IDs, depois busca detalhe em lote de 50 via `get_item_base_info`.
   *  Item sem variação vira 1 entrada; item com variação (`has_model`
   *  não vazio) busca `get_model_list` à parte, uma entrada por SKU real —
   *  mesma chamada extra que `consultarEstoque` já paga hoje pra esse caso. */
  /** Além dos itens, devolve por que anúncio ficou de fora.
   *
   *  Existe por um caso real: o catálogo da Shopee da ARMARINHOS LIMA
   *  terminava toda execução com `{ produtosCriados: 0, ignorados: 65 }` e
   *  ZERO variações importadas, enquanto pedidos chegavam com SKUs de
   *  variação (KIT4_ESSENZA, KIT5_SUPREME) que não existiam como produto —
   *  e por isso não podiam ser ingeridos. O motivo era invisível: anúncio
   *  fora do status NORMAL era pulado em silêncio, e falha ao buscar
   *  variações virava só um `console.error` que evaporava. Sem esses
   *  números não dá pra distinguir "a loja não tem variação" de "a busca de
   *  variação está falhando", que pedem correções opostas. */
  async listarCatalogoAtivo(): Promise<{
    itens: ShopeeAnuncioCatalogo[];
    diagnostico: DiagnosticoCatalogoShopee;
  }> {
    garantirNaoPausado();
    const diagnostico: DiagnosticoCatalogoShopee = {
      anunciosConsultados: 0,
      foraDoStatusNormal: 0,
      comVariacao: 0,
      variacoesIndisponiveis: 0,
      motivosVariacao: [],
    };
    const itemIds = await this.listarItemIdsAtivos();
    if (itemIds.length === 0) return { itens: [], diagnostico };

    type ShopeeItemBase = {
      item_id: number;
      item_name?: string;
      item_sku?: string;
      item_status?: string;
      price_info?: ShopeePriceInfo;
      stock_info_v2?: ShopeeStockInfo;
      has_model?: boolean;
    };

    const itens: ShopeeAnuncioCatalogo[] = [];
    for (let i = 0; i < itemIds.length; i += 50) {
      const lote = itemIds.slice(i, i + 50);
      const res = await shopeeFetch(this.url("/product/get_item_base_info", {
        item_id_list: lote.join(","),
        response_optional_fields: "item_name,item_sku,item_status,price_info,stock_info_v2,has_model",
      }), { signal: AbortSignal.timeout(10000) });
      if (!res.ok) {
        const detalhe = (await res.text().catch(() => "")).replace(/[\r\n]+/g, " ").slice(0, 240);
        throw new Error(`Shopee HTTP ${res.status} em get_item_base_info: ${detalhe}`);
      }
      const data = await res.json() as { error?: string; message?: string; response?: { item_list?: ShopeeItemBase[] } };
      if (data.error) throw new Error(`Shopee get_item_base_info: ${data.message ?? data.error}`);

      for (const item of data.response?.item_list ?? []) {
        diagnostico.anunciosConsultados += 1;
        // NORMAL é o único status "à venda" — pausado/banido/deletado não
        // deve virar produto novo no Estoque (mesmo filtro que o `active`
        // do Mercado Livre já aplica na busca de anúncios).
        if (item.item_status && item.item_status !== "NORMAL") {
          diagnostico.foraDoStatusNormal += 1;
          continue;
        }

        // `has_model`, NÃO `tier_variation`: verificado ao vivo contra a loja
        // WUWU em 27/08/2026 — `tier_variation` volta `undefined` sempre, seja
        // pedido em `response_optional_fields` ou via `need_tier_variation=true`.
        // Como todo item caía em "sem variação", o SKU gravado era o do anúncio
        // (`item_sku`) e nunca o da variação, então pedido de variação (W613-BL,
        // W613-CZ) não achava produto nenhum e o diagnóstico mostrava
        // `comVariacao: 0` numa loja onde os anúncios TÊM variação.
        const temVariacao = item.has_model === true;
        if (temVariacao) diagnostico.comVariacao += 1;
        if (!temVariacao) {
          itens.push({
            listingId: String(item.item_id),
            variationId: null,
            externalSku: item.item_sku || null,
            title: item.item_name ?? String(item.item_id),
            availableQuantity: saldoDoEstoque(item.stock_info_v2),
            price: precoDoItem(item.price_info),
          });
          continue;
        }

        try {
          const modelos = await this.listarModelosItem(item.item_id);
          for (const modelo of modelos) {
            itens.push({
              listingId: String(item.item_id),
              variationId: String(modelo.model_id),
              externalSku: modelo.model_sku || item.item_sku || null,
              title: item.item_name ?? String(item.item_id),
              availableQuantity: saldoDoEstoque(modelo.stock_info_v2),
              price: precoDoItem(modelo.price_info),
            });
          }
        } catch (error) {
          // Falha num item não derruba o catálogo — mas também não pode mais
          // sumir com o anúncio. Antes o `continue` implícito descartava o
          // anúncio INTEIRO, então nenhum produto nascia pra ele e todo
          // pedido daquela venda caía em "SKU sem produto na marca", sem
          // nada em lugar nenhum explicando por quê.
          //
          // Agora entra a versão no nível do anúncio (mesmo formato de quem
          // não tem variação): o produto passa a existir e o pedido consegue
          // casar. É pior que a variação certa — um produto para o anúncio
          // todo em vez de um por variação —, e é muito melhor que nada.
          // Quando a busca de variação voltar a funcionar, a execução
          // seguinte cria as variações que faltam.
          diagnostico.variacoesIndisponiveis += 1;
          const motivo = error instanceof Error ? error.message : String(error);
          if (diagnostico.motivosVariacao.length < 3 && !diagnostico.motivosVariacao.includes(motivo)) {
            diagnostico.motivosVariacao.push(motivo.slice(0, 200));
          }
          console.error(`[shopee] falha ao buscar variações do item ${item.item_id}`, error);
          itens.push({
            listingId: String(item.item_id),
            variationId: null,
            externalSku: item.item_sku || null,
            title: item.item_name ?? String(item.item_id),
            availableQuantity: saldoDoEstoque(item.stock_info_v2),
            price: precoDoItem(item.price_info),
          });
        }
      }
    }
    return { itens, diagnostico };
  }

  async saude(): Promise<SaudeConector> {
    const inicio = Date.now();
    // "degradado", não "erro": a conta continua conectada de verdade, só
    // estamos escolhendo não chamar a API por enquanto (ver
    // SHOPEE_REQUISICOES_PAUSADAS). "erro" sugeriria algo quebrado.
    if (SHOPEE_REQUISICOES_PAUSADAS) {
      return { status: "degradado", latenciaMs: 0, mensagem: "Requisições pausadas manualmente", verificadoEm: new Date() };
    }
    try {
      const res = await shopeeFetch(this.url("/shop/get_shop_info"), { signal: AbortSignal.timeout(20000) });
      const latenciaMs = Date.now() - inicio;
      if (!res.ok) return { status: "degradado", latenciaMs, mensagem: `HTTP ${res.status}`, verificadoEm: new Date() };
      return { status: "ok", latenciaMs, mensagem: "Conectado", verificadoEm: new Date() };
    } catch (err) {
      return { status: "erro", latenciaMs: Date.now() - inicio, mensagem: String(err), verificadoEm: new Date() };
    }
  }
}

// Mesmo desenho do token do Mercado Livre (obterTokenMercadoLivre): um client
// reaproveitado entre chamadas e cache curto por marca, porque webhook e jobs
// batem aqui a cada notificação. O que a Shopee guarda por marca é o par
// shop_id + access_token — partner_id/partner_key continuam vindo do ambiente,
// já que são do app, não da loja.
let supabaseTokenClient: SupabaseClient | null = null;
const cacheTokenPorMarca = new Map<string, { valor: LinhaTokenShopee | null; expiraEm: number }>();
const TTL_CACHE_TOKEN_MS = 60_000;

interface LinhaTokenShopee {
  access_token?: string;
  seller_id?: string;
  expires_at?: string;
}

/** Sufixo das env vars de fallback por marca (SHOPEE_ACCESS_TOKEN_*,
 *  SHOPEE_SHOP_ID_*). Mesma lógica do infixo de partner_id em shopee-env.ts:
 *  o app de catálogo veio primeiro e ficou sem infixo. */
function sufixoEnvTokenShopee(app: ShopeeApp, upper: string): string {
  if (app === "pedidos") return `PEDIDOS_${upper}`;
  if (app === "anuncios") return `ANUNCIOS_${upper}`;
  if (app === "financeiro") return `FINANCEIRO_${upper}`;
  return upper;
}

/** Qual access_token usar: o gravado em `canal_tokens` ou o do ambiente.
 *
 *  A margem de 60 segundos antes do vencimento era tratada como "expirado":
 *  o código descartava o token do banco e exigia o do ambiente — que é
 *  placeholder proposital e costuma estar vazio. Durante os ~60s em que o A33
 *  renova o token, QUALQUER chamada lançava "token OAuth expirado", mesmo com
 *  um token perfeitamente válido gravado. Job curto passava batido; a
 *  sincronização de 1073 pedidos da WUWU atravessa a janela e morreu no meio
 *  duas vezes seguidas em 27/08/2026, sempre no minuto da renovação.
 *
 *  Agora a margem só muda a PREFERÊNCIA: sem token de ambiente, um token do
 *  banco que ainda vale 30s é usado — melhor que falhar de imediato, e o A33
 *  já renovou antes da chamada seguinte. Só token de fato vencido é recusado. */
export function escolherAccessTokenShopee(
  tokenBanco: string | undefined,
  expiraEm: string | undefined,
  doAmbiente: string | undefined,
  agoraMs: number = Date.now(),
): { accessToken: string | undefined; tokenBancoVencido: boolean } {
  const vencimentoMs = expiraEm ? new Date(expiraEm).getTime() : null;
  const vencido = vencimentoMs !== null && vencimentoMs <= agoraMs;
  const pertoDeVencer = vencimentoMs !== null && !vencido && vencimentoMs <= agoraMs + 60_000;

  if (vencido) return { accessToken: doAmbiente, tokenBancoVencido: true };
  if (pertoDeVencer) return { accessToken: doAmbiente ?? tokenBanco, tokenBancoVencido: false };
  return { accessToken: tokenBanco ?? doAmbiente, tokenBancoVencido: false };
}

export async function obterTokenShopee(brandSlug: BrandSlug, app: ShopeeApp = "catalogo"): Promise<{
  shopId: string;
  accessToken: string;
}> {
  const upper = brandEnvSuffix(brandSlug);
  const sufixoEnv = sufixoEnvTokenShopee(app, upper);
  const canal = canalTokenShopee(app);
  const orgId = process.env.DEFAULT_ORG_ID;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  let tokenRow: LinhaTokenShopee | null = null;
  const cacheKey = `${orgId}:${brandSlug}:${canal}`;
  const emCache = cacheTokenPorMarca.get(cacheKey);
  if (emCache && emCache.expiraEm > Date.now()) {
    tokenRow = emCache.valor;
  } else if (orgId && supabaseUrl && serviceRoleKey) {
    supabaseTokenClient ??= createClient(supabaseUrl, serviceRoleKey);
    const supabase = supabaseTokenClient;
    const marca = await supabase
      .from("brand")
      .select("id")
      .eq("org_id", orgId)
      .eq("slug", brandSlug)
      .eq("active", true)
      .maybeSingle();
    if (marca.data?.id) {
      const result = await supabase
        .from("canal_tokens")
        .select("access_token, seller_id, expires_at")
        .eq("org_id", orgId)
        .eq("brand_id", marca.data.id)
        .eq("canal", canal)
        .maybeSingle();
      tokenRow = result.data;
    }
    cacheTokenPorMarca.set(cacheKey, { valor: tokenRow, expiraEm: Date.now() + TTL_CACHE_TOKEN_MS });
  }

  const doAmbiente = process.env[`SHOPEE_ACCESS_TOKEN_${sufixoEnv}`];
  const escolha = escolherAccessTokenShopee(tokenRow?.access_token, tokenRow?.expires_at, doAmbiente);
  const { accessToken, tokenBancoVencido } = escolha;
  const shopId = (tokenBancoVencido ? undefined : tokenRow?.seller_id)
    ?? process.env[`SHOPEE_SHOP_ID_${sufixoEnv}`];

  if (accessToken && accessToken === doAmbiente && (!tokenRow || tokenBancoVencido)) {
    const motivo = tokenRow ? "token OAuth em canal_tokens expirado" : "nenhum token persistido em canal_tokens";
    console.warn(
      `[shopee] usando SHOPEE_ACCESS_TOKEN_${sufixoEnv} do ambiente (${motivo}). ` +
      "Reconecte via OAuth em /configuracoes assim que possível.",
    );
  }

  if (!accessToken || !shopId) {
    const motivo = tokenBancoVencido ? "token OAuth expirado" : "token ausente";
    throw new Error(`Credencial Shopee (${app}) indisponível para ${upper}: ${motivo}.`);
  }

  return { shopId, accessToken };
}

export async function criarShopeeProvider(brandSlug: BrandSlug): Promise<ShopeeProvider> {
  const upper = brandEnvSuffix(brandSlug);
  const { partnerId, partnerKey } = obterShopeeAppCredenciais("catalogo");
  if (!partnerId || !partnerKey) {
    throw new Error(`Credenciais Shopee (catálogo) não configuradas para ${upper}.`);
  }

  const { shopId, accessToken } = await obterTokenShopee(brandSlug, "catalogo");

  // App de Pedidos é opcional aqui de propósito: SHOPEE_PEDIDOS_LIBERADO
  // continua sendo o freio de verdade pra chamar `buscarPedidos` — faltar
  // essa credencial/token não pode impedir catálogo/estoque/avaliações de
  // funcionar. Se a marca ainda não autorizou o app Pedidos (ou faltar
  // partner_id/key dele), credsPedidos fica undefined e urlPedidos() lança
  // erro só se/quando alguém tentar chamá-la.
  const credsAppPedidos = obterShopeeAppCredenciais("pedidos");
  let credsPedidos: { partnerId: string; partnerKey: string; shopId: string; accessToken: string } | undefined;
  if (credsAppPedidos.partnerId && credsAppPedidos.partnerKey) {
    try {
      const tokenPedidos = await obterTokenShopee(brandSlug, "pedidos");
      credsPedidos = { partnerId: credsAppPedidos.partnerId, partnerKey: credsAppPedidos.partnerKey, ...tokenPedidos };
    } catch {
      // Marca ainda não autorizou o app Pedidos — sem token, sem problema,
      // ver comentário acima.
    }
  }

  // Mesma regra do app de Pedidos, e pelo mesmo motivo: opcional de
  // propósito. Marca que ainda não autorizou o app Financeiro continua
  // sincronizando catálogo, estoque e pedidos normalmente — só entra sem o
  // financeiro do pedido, que a A34 preenche depois que a autorização vier.
  const credsAppFinanceiro = obterShopeeAppCredenciais("financeiro");
  let credsFinanceiro: ShopeeCredentials | undefined;
  if (credsAppFinanceiro.partnerId && credsAppFinanceiro.partnerKey) {
    try {
      const tokenFinanceiro = await obterTokenShopee(brandSlug, "financeiro");
      credsFinanceiro = {
        partnerId: credsAppFinanceiro.partnerId,
        partnerKey: credsAppFinanceiro.partnerKey,
        ...tokenFinanceiro,
      };
    } catch {
      // Sem token do app Financeiro — urlFinanceiro() lança só se/quando o
      // escrow for pedido, e buscarFinanceiroPedidos trata isso como
      // "sem permissão" e segue sem derrubar a sincronização.
    }
  }

  return new ShopeeProvider(
    { partnerId, partnerKey, shopId, accessToken },
    credsPedidos,
    credsFinanceiro,
  );
}
