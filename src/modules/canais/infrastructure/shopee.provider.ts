import crypto from "crypto";
import type { ChannelProvider, EstoqueCanalRef, PedidoNormalizado, SaudeConector } from "../domain/ports";
import { shopeeFetch } from "@/shared/lib/shopee-proxy";
import { brandEnvSuffix, type BrandSlug } from "@/shared/config/brands";
import { obterShopeeBaseUrl, obterShopeeAppCredenciais } from "@/shared/config/shopee-env";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

interface ShopeeCredentials {
  partnerId: string;
  partnerKey: string;
  shopId: string;
  accessToken: string;
}

export interface ShopeeOpiniao {
  id: string;
  titulo: string | null;
  conteudo: string | null;
  nota: number;
  criadaEm: string | null;
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
function precoDoItem(priceInfo?: ShopeePriceInfo): string {
  const info = priceInfo?.[0];
  return String(info?.current_price ?? info?.original_price ?? 0);
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

  constructor(creds: ShopeeCredentials, credsPedidos?: ShopeeCredentials) {
    this.creds = creds;
    this.credsPedidos = credsPedidos;
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

  // get_order_list rejeita qualquer janela (time_to - time_from) maior que
  // 15 dias — "Start time must be earlier than end time and diff in 15days."
  // Achado em produção em 25/08/2026: a sincronização manual pede 90 dias de
  // uma vez (ver A31-sincronizar-conta.ts) e falhava 100% das vezes. Aqui
  // fatiamos o intervalo pedido em janelas de até 15 dias e concatenamos.
  private static readonly JANELA_MAX_PEDIDOS_MS = 15 * 24 * 60 * 60 * 1000;

  async buscarPedidos(desde: Date): Promise<PedidoNormalizado[]> {
    const agora = Date.now();
    const pedidos: PedidoNormalizado[] = [];
    let inicioJanela = desde.getTime();
    while (inicioJanela < agora) {
      const fimJanela = Math.min(inicioJanela + ShopeeProvider.JANELA_MAX_PEDIDOS_MS, agora);
      pedidos.push(...await this.buscarPedidosJanela(inicioJanela, fimJanela));
      inicioJanela = fimJanela;
    }
    return pedidos;
  }

  private async buscarPedidosJanela(inicioMs: number, fimMs: number): Promise<PedidoNormalizado[]> {
    const timeFrom = Math.floor(inicioMs / 1000);
    const timeTo = Math.floor(fimMs / 1000);

    const listRes = await shopeeFetch(this.urlPedidos("/order/get_order_list", {
      time_range_field: "create_time",
      time_from: timeFrom,
      time_to: timeTo,
      page_size: 50,
      response_optional_fields: "buyer_username,total_amount",
    }), { signal: AbortSignal.timeout(10000) });

    if (!listRes.ok) {
      const detalhe = (await listRes.text().catch(() => "")).replace(/[\r\n]+/g, " ").slice(0, 240);
      throw new Error(`Shopee HTTP ${listRes.status} em get_order_list: ${detalhe}`);
    }
    const listData = await listRes.json() as {
      error?: string;
      message?: string;
      response?: { order_list?: { order_sn: string; order_status: string; total_amount: number; buyer_username: string; create_time: number }[] };
    };
    if (listData.error) throw new Error(`Shopee get_order_list: ${listData.message ?? listData.error}`);

    const orders = listData.response?.order_list ?? [];
    if (orders.length === 0) return [];

    // Busca detalhes (itens de linha) em lote — máx 50 por chamada
    const sns = orders.map((o) => o.order_sn).join(",");
    const detailRes = await shopeeFetch(this.urlPedidos("/order/get_order_detail", {
      order_sn_list: sns,
      response_optional_fields: "item_list,recipient_address,buyer_user_id",
    }), { signal: AbortSignal.timeout(15000) });

    type ShopeeItem = { item_sku: string; model_quantity_purchased: number; model_discounted_price: number };
    type ShopeeDetail = {
      order_sn: string;
      recipient_address?: { name: string; phone?: string };
      item_list?: ShopeeItem[];
    };

    if (!detailRes.ok) {
      const detalhe = (await detailRes.text().catch(() => "")).replace(/[\r\n]+/g, " ").slice(0, 240);
      throw new Error(`Shopee HTTP ${detailRes.status} em get_order_detail: ${detalhe}`);
    }
    const detailData = await detailRes.json() as { error?: string; message?: string; response?: { order_list?: ShopeeDetail[] } };
    if (detailData.error) throw new Error(`Shopee get_order_detail: ${detailData.message ?? detailData.error}`);
    const detailMap = new Map<string, ShopeeDetail>();
    for (const d of detailData.response?.order_list ?? []) {
      detailMap.set(d.order_sn, d);
    }

    const detalhesAusentes = orders.filter((order) => !detailMap.has(order.order_sn));
    if (detalhesAusentes.length > 0) {
      throw new Error(`Shopee não retornou detalhes de ${detalhesAusentes.length} pedido(s).`);
    }

    return orders.map((o) => {
      const detail = detailMap.get(o.order_sn);
      return {
        providerOrderId: o.order_sn,
        canal: "shopee",
        clienteExternalId: o.buyer_username,
        clienteNome: detail?.recipient_address?.name ?? o.buyer_username,
        clienteTelefone: detail?.recipient_address?.phone,
        status: o.order_status.toLowerCase(),
        total: String(o.total_amount),
        itens: (detail?.item_list ?? []).map((i) => ({
          skuExterno: i.item_sku,
          quantidade: i.model_quantity_purchased,
          precoUnitario: String(i.model_discounted_price),
        })),
        criadoEm: new Date(o.create_time * 1000),
      };
    });
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
    const res = await shopeeFetch(this.url("/product/get_model_list", {
      item_id: Number(referencia.listingId),
    }), { signal: AbortSignal.timeout(8000) });
    const data = await res.json().catch(() => null) as {
      error?: string;
      message?: string;
      response?: {
        model?: Array<{
          model_id?: number;
          stock_info_v2?: { seller_stock?: Array<{ stock?: number }> };
          normal_stock?: number;
        }>;
      };
    } | null;
    if (!res.ok || data?.error) {
      throw new Error(`Shopee consulta de estoque falhou para anúncio ${referencia.listingId}: ${data?.message ?? data?.error ?? `HTTP ${res.status}`}`);
    }

    const modelos = (data?.response?.model ?? []).filter((modelo) => !referencia.skuId || String(modelo.model_id) === referencia.skuId);
    if (referencia.skuId && modelos.length === 0) {
      throw new Error(`Shopee não retornou o modelo ${referencia.skuId} do anúncio ${referencia.listingId}.`);
    }
    const saldo = modelos.reduce((total, modelo) => {
      const sellerStock = modelo.stock_info_v2?.seller_stock?.reduce((sum, item) => sum + Number(item.stock ?? 0), 0);
      return total + (sellerStock ?? Number(modelo.normal_stock ?? 0));
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
  async listarAvaliacoes(): Promise<ShopeeAnuncioAvaliacao[]> {
    garantirNaoPausado();
    type ShopeeComentario = {
      comment_id?: number | string;
      item_id: number;
      comment?: string;
      rating_star?: number;
      create_time?: number;
      buyer_username?: string;
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
        opinioes: lista
          .filter((c) => c.comment)
          .sort((a, b) => (b.create_time ?? 0) - (a.create_time ?? 0))
          .map((c) => ({
            id: String(c.comment_id ?? `${itemId}-${c.create_time}`),
            titulo: null,
            conteudo: c.comment ?? null,
            nota: c.rating_star ?? 0,
            criadaEm: c.create_time ? new Date(c.create_time * 1000).toISOString() : null,
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
  }>> {
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
      response?: { model?: Array<{ model_id: number; model_sku?: string; price_info?: ShopeePriceInfo; stock_info_v2?: ShopeeStockInfo }> };
    };
    if (data.error) throw new Error(`Shopee get_model_list: ${data.message ?? data.error}`);
    return data.response?.model ?? [];
  }

  /** Catálogo inteiro da loja (ativo à venda), pro importador do Estoque —
   *  equivalente Shopee do `listarAnunciosAtivos` do Mercado Livre. Reusa
   *  `listarItemIdsAtivos` (já existente pra Avaliações) pra descobrir os
   *  IDs, depois busca detalhe em lote de 50 via `get_item_base_info`.
   *  Item sem variação vira 1 entrada; item com variação (`tier_variation`
   *  não vazio) busca `get_model_list` à parte, uma entrada por SKU real —
   *  mesma chamada extra que `consultarEstoque` já paga hoje pra esse caso. */
  async listarCatalogoAtivo(): Promise<ShopeeAnuncioCatalogo[]> {
    garantirNaoPausado();
    const itemIds = await this.listarItemIdsAtivos();
    if (itemIds.length === 0) return [];

    type ShopeeItemBase = {
      item_id: number;
      item_name?: string;
      item_sku?: string;
      item_status?: string;
      price_info?: ShopeePriceInfo;
      stock_info_v2?: ShopeeStockInfo;
      tier_variation?: unknown[];
    };

    const itens: ShopeeAnuncioCatalogo[] = [];
    for (let i = 0; i < itemIds.length; i += 50) {
      const lote = itemIds.slice(i, i + 50);
      const res = await shopeeFetch(this.url("/product/get_item_base_info", {
        item_id_list: lote.join(","),
        response_optional_fields: "item_name,item_sku,item_status,price_info,stock_info_v2,tier_variation",
      }), { signal: AbortSignal.timeout(10000) });
      if (!res.ok) {
        const detalhe = (await res.text().catch(() => "")).replace(/[\r\n]+/g, " ").slice(0, 240);
        throw new Error(`Shopee HTTP ${res.status} em get_item_base_info: ${detalhe}`);
      }
      const data = await res.json() as { error?: string; message?: string; response?: { item_list?: ShopeeItemBase[] } };
      if (data.error) throw new Error(`Shopee get_item_base_info: ${data.message ?? data.error}`);

      for (const item of data.response?.item_list ?? []) {
        // NORMAL é o único status "à venda" — pausado/banido/deletado não
        // deve virar produto novo no Estoque (mesmo filtro que o `active`
        // do Mercado Livre já aplica na busca de anúncios).
        if (item.item_status && item.item_status !== "NORMAL") continue;

        const temVariacao = Array.isArray(item.tier_variation) && item.tier_variation.length > 0;
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
          // Mesma filosofia do resto do importador: falha num item não pode
          // derrubar o catálogo inteiro, só esse item fica de fora dessa vez.
          console.error(`[shopee] falha ao buscar variações do item ${item.item_id}`, error);
        }
      }
    }
    return itens;
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

/** canal na tabela canal_tokens: "shopee" pro app CRM (catálogo), "shopee_pedidos"
 *  pro app Pedidos — linhas independentes porque cada app tem sua própria
 *  autorização/access_token na Shopee, mesmo pra a mesma loja. */
function canalTokenShopee(app: "catalogo" | "pedidos"): string {
  return app === "pedidos" ? "shopee_pedidos" : "shopee";
}

export async function obterTokenShopee(brandSlug: BrandSlug, app: "catalogo" | "pedidos" = "catalogo"): Promise<{
  shopId: string;
  accessToken: string;
}> {
  const upper = brandEnvSuffix(brandSlug);
  const sufixoEnv = app === "pedidos" ? `PEDIDOS_${upper}` : upper;
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

  const tokenBancoExpirado = tokenRow?.expires_at
    ? new Date(tokenRow.expires_at).getTime() <= Date.now() + 60_000
    : false;
  const accessToken = tokenBancoExpirado
    ? process.env[`SHOPEE_ACCESS_TOKEN_${sufixoEnv}`]
    : tokenRow?.access_token ?? process.env[`SHOPEE_ACCESS_TOKEN_${sufixoEnv}`];
  const shopId = (tokenBancoExpirado ? undefined : tokenRow?.seller_id)
    ?? process.env[`SHOPEE_SHOP_ID_${sufixoEnv}`];

  if (accessToken && (!tokenRow || tokenBancoExpirado)) {
    const motivo = tokenRow ? "token OAuth em canal_tokens expirado" : "nenhum token persistido em canal_tokens";
    console.warn(
      `[shopee] usando SHOPEE_ACCESS_TOKEN_${sufixoEnv} do ambiente (${motivo}). ` +
      "Reconecte via OAuth em /configuracoes assim que possível.",
    );
  }

  if (!accessToken || !shopId) {
    const motivo = tokenBancoExpirado ? "token OAuth expirado" : "token ausente";
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

  return new ShopeeProvider({ partnerId, partnerKey, shopId, accessToken }, credsPedidos);
}
