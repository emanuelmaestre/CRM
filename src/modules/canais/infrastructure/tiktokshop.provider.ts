import crypto from "crypto";
import { proximoCursorSeguro } from "../domain/paginacao";
import type { ChannelProvider, EstoqueCanalRef, PedidoNormalizado, SaudeConector, OpcoesBuscaPedidos } from "../domain/ports";
import { brandEnvSuffix, type BrandSlug } from "@/shared/config/brands";
import { shopeeFetch } from "@/shared/lib/shopee-proxy";
import { createClient } from "@supabase/supabase-js";

interface TikTokCredentials {
  appKey: string;
  appSecret: string;
  accessToken: string;
  shopCipher: string;
}

type TikTokResponse<T> = { code?: number; message?: string; data?: T };
type TikTokOrder = {
  id: string;
  status: string;
  payment?: { total_amount?: string; shipping_fee?: string };
  payment_info?: { total_amount?: string };
  recipient_address?: { name?: string; phone_number?: string };
  buyer_uid?: string;
  buyer_email?: string;
  create_time: number;
  update_time?: number;
  line_items?: Array<{ seller_sku: string; sku_id?: string; quantity: number; sale_price: string }>;
};

export class TikTokShopProvider implements ChannelProvider {
  private readonly baseUrl = "https://open-api.tiktokglobalshop.com";

  constructor(private readonly creds: TikTokCredentials) {}

  private assinar(path: string, params: Record<string, string>, body?: unknown): string {
    const paramString = Object.keys(params)
      .filter((key) => key !== "sign" && key !== "access_token")
      .sort()
      .map((key) => `${key}${params[key]}`)
      .join("");
    const bodyString = body === undefined ? "" : JSON.stringify(body);
    const signString = `${this.creds.appSecret}${path}${paramString}${bodyString}${this.creds.appSecret}`;
    return crypto.createHmac("sha256", this.creds.appSecret).update(signString).digest("hex");
  }

  private async request<T>(
    path: string,
    options: { method?: "GET" | "POST"; query?: Record<string, string>; body?: unknown; timeoutMs?: number } = {},
  ): Promise<T> {
    const params: Record<string, string> = {
      app_key: this.creds.appKey,
      timestamp: String(Math.floor(Date.now() / 1000)),
      shop_cipher: this.creds.shopCipher,
      ...options.query,
    };
    params.sign = this.assinar(path, params, options.body);
    // Mesmo proxy de IP fixo da Shopee (shopeeFetch): o IP cadastrado na
    // "Lista de permissões de IP" do app TikTok no Partner Center é o mesmo
    // IP do proxy Webshare já usado pela Shopee — sem ele, a chamada sai pelo
    // IP efêmero da Vercel e o TikTok recusa.
    const res = await shopeeFetch(`${this.baseUrl}${path}?${new URLSearchParams(params)}`, {
      method: options.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        "x-tts-access-token": this.creds.accessToken,
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.timeout(options.timeoutMs ?? 10_000),
    });
    const payload = await res.json().catch(() => null) as TikTokResponse<T> | null;
    if (!res.ok || !payload || (payload.code !== undefined && payload.code !== 0)) {
      throw new Error(`TikTok Shop ${path}: ${payload?.message ?? `HTTP ${res.status}`}`);
    }
    if (payload.data === undefined) throw new Error(`TikTok Shop ${path} retornou resposta sem data.`);
    return payload.data;
  }

  async buscarPedidos(desde: Date, opcoes: OpcoesBuscaPedidos = {}): Promise<PedidoNormalizado[]> {
    const pedidos = new Map<string, TikTokOrder>();
    const cursores = new Set<string>();
    const ate = Math.floor((opcoes.ate?.getTime() ?? Date.now()) / 1000);
    const campo = opcoes.campoData === "atualizacao" ? "update_time" : "create_time";
    let cursor = "";
    for (let pagina = 0; pagina < 200; pagina++) {
      const data = await this.request<{ orders?: TikTokOrder[]; next_page_token?: string; total_count?: number }>("/order/202309/orders/search", {
        method: "POST",
        query: { page_size: "50", sort_order: "ASC", sort_field: campo, ...(cursor ? { page_token: cursor } : {}) },
        body: { [`${campo}_ge`]: Math.floor(desde.getTime() / 1000), [`${campo}_lt`]: ate },
      });
      if (!Array.isArray(data.orders)) throw new Error("TikTok: listagem sem array de pedidos.");
      for (const pedido of data.orders) pedidos.set(pedido.id, pedido);
      const proximo = proximoCursorSeguro(cursor, data.next_page_token, Boolean(data.next_page_token), cursores, "TikTok pedidos");
      if (proximo === null) {
        if (data.total_count != null && pedidos.size < data.total_count) throw new Error("TikTok: pedidos incompletos sem continuação.");
        // A listagem pode não trazer itens/pagamento: o detalhe é obrigatório.
        return this.buscarPedidosPorIds([...pedidos.keys()]);
      }
      cursor = proximo;
    }
    throw new Error("TikTok: coleta incompleta após 200 páginas.");
  }

  async buscarPedidosPorIds(ids: string[]): Promise<PedidoNormalizado[]> {
    const resultados: PedidoNormalizado[] = [];
    const unicos = [...new Set(ids)];
    for (let i = 0; i < unicos.length; i += 50) {
      const lote = unicos.slice(i, i + 50);
      const data = await this.request<{ orders?: TikTokOrder[] }>("/order/202309/orders", {
        query: { ids: lote.join(",") },
      });
      if (!Array.isArray(data.orders) || lote.some((id) => !data.orders!.some((o) => o.id === id))) {
        throw new Error("TikTok: detalhe de pedidos incompleto; repetir a coleta.");
      }
      resultados.push(...this.normalizarPedidos(data.orders.filter((o) => lote.includes(o.id))));
    }
    return resultados;
  }

  private normalizarPedidos(orders: TikTokOrder[]): PedidoNormalizado[] {
    return orders.map((order) => ({
      providerOrderId: order.id,
      canal: "tiktokshop",
      clienteExternalId: order.buyer_uid ?? order.buyer_email ?? order.id,
      clienteNome: order.recipient_address?.name ?? order.buyer_uid ?? "Cliente TikTok Shop",
      clienteEmail: order.buyer_email,
      clienteTelefone: order.recipient_address?.phone_number,
      status: order.status.toLowerCase(),
      total: order.payment?.total_amount ?? order.payment_info?.total_amount ?? "",
      frete: order.payment?.shipping_fee,
      itens: (order.line_items ?? []).map((item) => ({
        skuExterno: item.seller_sku,
        quantidade: item.quantity,
        precoUnitario: item.sale_price,
      })),
      criadoEm: new Date(order.create_time * 1000),
      atualizadoOrigemEm: order.update_time ? new Date(order.update_time * 1000) : undefined,
      dadosOrigem: { status: order.status, financeiroInformado: !!(order.payment ?? order.payment_info) },
    }));
  }

  async sincronizarEstoque(referencia: EstoqueCanalRef, saldo: number): Promise<void> {
    if (!referencia.skuId || !referencia.warehouseId) {
      throw new Error("TikTok Shop exige externalSkuId e externalWarehouseId no mapeamento do produto.");
    }
    await this.request(`/product/202309/products/${referencia.listingId}/inventory/update`, {
      method: "POST",
      body: {
        skus: [{
          id: referencia.skuId,
          inventory: [{ warehouse_id: referencia.warehouseId, quantity: saldo }],
        }],
      },
      timeoutMs: 8_000,
    });
  }

  async consultarEstoque(referencia: EstoqueCanalRef): Promise<number> {
    const product = await this.request<{
      skus?: Array<{
        id?: string;
        inventory?: Array<{ warehouse_id?: string; quantity?: number }>;
        stock_infos?: Array<{ available_stock?: number }>;
      }>;
    }>(`/product/202309/products/${referencia.listingId}`, { timeoutMs: 8_000 });

    const skus = (product.skus ?? []).filter((sku) => !referencia.skuId || sku.id === referencia.skuId);
    if (referencia.skuId && skus.length === 0) {
      throw new Error(`TikTok Shop não retornou o SKU ${referencia.skuId}.`);
    }
    const saldo = skus.reduce((total, sku) => {
      const inventory = (sku.inventory ?? []).filter((item) => !referencia.warehouseId || item.warehouse_id === referencia.warehouseId);
      const value = inventory.length > 0
        ? inventory.reduce((sum, item) => sum + Number(item.quantity ?? 0), 0)
        : (sku.stock_infos ?? []).reduce((sum, item) => sum + Number(item.available_stock ?? 0), 0);
      return total + value;
    }, 0);
    if (!Number.isInteger(saldo) || saldo < 0) {
      throw new Error(`TikTok Shop retornou saldo inválido para anúncio ${referencia.listingId}.`);
    }
    return saldo;
  }

  async saude(): Promise<SaudeConector> {
    const inicio = Date.now();
    try {
      await this.request<{ shops?: unknown[] }>("/seller/202309/shops", { timeoutMs: 5_000 });
      return { status: "ok", latenciaMs: Date.now() - inicio, mensagem: "Conectado", verificadoEm: new Date() };
    } catch (error) {
      return { status: "erro", latenciaMs: Date.now() - inicio, mensagem: String(error), verificadoEm: new Date() };
    }
  }
}

let supabaseTokenClient: ReturnType<typeof createClient> | undefined;

/** Access token do canal_tokens (canal "tiktokshop", gravado pelo fluxo OAuth
 *  em /api/tiktok/connect + /api/tiktok/callback) tem prioridade sobre
 *  TIKTOK_ACCESS_TOKEN_{BRAND} — mesmo padrão do fallback estático do ML
 *  (ver memória "ML env token placeholders"): só é lido quando não existe
 *  token persistido pra marca, nunca atualizado automaticamente. */
async function obterAccessTokenTikTok(brandSlug: BrandSlug): Promise<string | undefined> {
  const orgId = process.env.DEFAULT_ORG_ID;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const upper = brandEnvSuffix(brandSlug);
  const fallbackEnv = process.env[`TIKTOK_ACCESS_TOKEN_${upper}`];

  if (!orgId || !supabaseUrl || !serviceRoleKey) return fallbackEnv;

  supabaseTokenClient ??= createClient(supabaseUrl, serviceRoleKey);
  const supabase = supabaseTokenClient;

  const marca = await supabase
    .from("brand")
    .select("id")
    .eq("org_id", orgId)
    .eq("slug", brandSlug)
    .eq("active", true)
    .maybeSingle() as { data: { id: string } | null };
  if (!marca.data?.id) return fallbackEnv;

  const tokenRow = await supabase
    .from("canal_tokens")
    .select("access_token, expires_at")
    .eq("org_id", orgId)
    .eq("brand_id", marca.data.id)
    .eq("canal", "tiktokshop")
    .maybeSingle() as { data: { access_token: string; expires_at: string | null } | null };

  const expirado = tokenRow.data?.expires_at
    ? new Date(tokenRow.data.expires_at).getTime() <= Date.now() + 60_000
    : true;

  return expirado ? fallbackEnv : tokenRow.data?.access_token ?? fallbackEnv;
}

export async function criarTikTokShopProvider(brandSlug: BrandSlug): Promise<TikTokShopProvider> {
  const upper = brandEnvSuffix(brandSlug);
  const appKey = process.env.TIKTOK_APP_KEY;
  const appSecret = process.env.TIKTOK_APP_SECRET;
  const shopCipher = process.env[`TIKTOK_SHOP_CIPHER_${upper}`];
  const accessToken = await obterAccessTokenTikTok(brandSlug);

  if (!appKey || !appSecret || !accessToken || !shopCipher) {
    throw new Error(`Credenciais TikTok Shop não configuradas para ${upper}.`);
  }
  return new TikTokShopProvider({ appKey, appSecret, accessToken, shopCipher });
}
