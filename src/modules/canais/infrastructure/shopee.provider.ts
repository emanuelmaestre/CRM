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

export class ShopeeProvider implements ChannelProvider {
  private readonly host = obterShopeeBaseUrl();
  private creds: ShopeeCredentials;

  constructor(creds: ShopeeCredentials) {
    this.creds = creds;
  }

  // A Shopee assina o CAMINHO COMPLETO da chamada (com /api/v2), o mesmo que
  // connect/route.ts e callback/route.ts já usam ("/api/v2/shop/auth_partner",
  // "/api/v2/auth/token/get"). Assinar só o sufixo (ex.: "/shop/get_shop_info",
  // sem o /api/v2) gera uma sign que não bate com a URL de fato chamada — a
  // Shopee aceita a chamada, mas rejeita com 403 "Wrong sign" silencioso (sem
  // reprovar a request em si, só a assinatura), então nenhum request feito
  // por este provider — get_shop_info, get_order_list, update_stock, etc. —
  // jamais funcionou até este fix, mesmo com token válido.
  private assinar(apiPath: string, timestamp: number): string {
    const base = `${this.creds.partnerId}${apiPath}${timestamp}${this.creds.accessToken}${this.creds.shopId}`;
    return crypto.createHmac("sha256", this.creds.partnerKey).update(base).digest("hex");
  }

  private url(path: string, params: Record<string, string | number> = {}): string {
    const apiPath = `/api/v2${path}`;
    const ts = Math.floor(Date.now() / 1000);
    const sign = this.assinar(apiPath, ts);
    const qs = new URLSearchParams({
      partner_id: this.creds.partnerId,
      shop_id: this.creds.shopId,
      access_token: this.creds.accessToken,
      timestamp: String(ts),
      sign,
      ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
    });
    return `${this.host}${apiPath}?${qs}`;
  }

  async buscarPedidos(desde: Date): Promise<PedidoNormalizado[]> {
    const timeFrom = Math.floor(desde.getTime() / 1000);
    const timeTo = Math.floor(Date.now() / 1000);

    const listRes = await shopeeFetch(this.url("/order/get_order_list", {
      time_range_field: "create_time",
      time_from: timeFrom,
      time_to: timeTo,
      page_size: 50,
      response_optional_fields: "buyer_username,total_amount",
    }), { signal: AbortSignal.timeout(10000) });

    if (!listRes.ok) throw new Error(`Shopee HTTP ${listRes.status} em get_order_list`);
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
    const detailRes = await shopeeFetch(this.url("/order/get_order_detail", {
      order_sn_list: sns,
      response_optional_fields: "item_list,recipient_address,buyer_user_id",
    }), { signal: AbortSignal.timeout(15000) });

    type ShopeeItem = { item_sku: string; model_quantity_purchased: number; model_discounted_price: number };
    type ShopeeDetail = {
      order_sn: string;
      recipient_address?: { name: string; phone?: string };
      item_list?: ShopeeItem[];
    };

    if (!detailRes.ok) throw new Error(`Shopee HTTP ${detailRes.status} em get_order_detail`);
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

  async saude(): Promise<SaudeConector> {
    const inicio = Date.now();
    try {
      const res = await shopeeFetch(this.url("/shop/get_shop_info"), { signal: AbortSignal.timeout(5000) });
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

export async function obterTokenShopee(brandSlug: BrandSlug): Promise<{
  shopId: string;
  accessToken: string;
}> {
  const upper = brandEnvSuffix(brandSlug);
  const orgId = process.env.DEFAULT_ORG_ID;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  let tokenRow: LinhaTokenShopee | null = null;
  const cacheKey = `${orgId}:${brandSlug}`;
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
        .eq("canal", "shopee")
        .maybeSingle();
      tokenRow = result.data;
    }
    cacheTokenPorMarca.set(cacheKey, { valor: tokenRow, expiraEm: Date.now() + TTL_CACHE_TOKEN_MS });
  }

  const tokenBancoExpirado = tokenRow?.expires_at
    ? new Date(tokenRow.expires_at).getTime() <= Date.now() + 60_000
    : false;
  const accessToken = tokenBancoExpirado
    ? process.env[`SHOPEE_ACCESS_TOKEN_${upper}`]
    : tokenRow?.access_token ?? process.env[`SHOPEE_ACCESS_TOKEN_${upper}`];
  const shopId = (tokenBancoExpirado ? undefined : tokenRow?.seller_id)
    ?? process.env[`SHOPEE_SHOP_ID_${upper}`];

  if (accessToken && (!tokenRow || tokenBancoExpirado)) {
    const motivo = tokenRow ? "token OAuth em canal_tokens expirado" : "nenhum token persistido em canal_tokens";
    console.warn(
      `[shopee] usando SHOPEE_ACCESS_TOKEN_${upper} do ambiente (${motivo}). ` +
      "Reconecte via OAuth em /configuracoes assim que possível.",
    );
  }

  if (!accessToken || !shopId) {
    const motivo = tokenBancoExpirado ? "token OAuth expirado" : "token ausente";
    throw new Error(`Credencial Shopee indisponível para ${upper}: ${motivo}.`);
  }

  return { shopId, accessToken };
}

export async function criarShopeeProvider(brandSlug: BrandSlug): Promise<ShopeeProvider> {
  const upper = brandEnvSuffix(brandSlug);
  const { partnerId, partnerKey } = obterShopeeAppCredenciais();
  if (!partnerId || !partnerKey) {
    throw new Error(`Credenciais Shopee não configuradas para ${upper}.`);
  }

  const { shopId, accessToken } = await obterTokenShopee(brandSlug);
  return new ShopeeProvider({ partnerId, partnerKey, shopId, accessToken });
}
