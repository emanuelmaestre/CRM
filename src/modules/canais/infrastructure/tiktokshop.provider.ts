import crypto from "crypto";
import type { ChannelProvider, EstoqueCanalRef, PedidoNormalizado, SaudeConector } from "../domain/ports";

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
    const res = await fetch(`${this.baseUrl}${path}?${new URLSearchParams(params)}`, {
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

  async buscarPedidos(desde: Date): Promise<PedidoNormalizado[]> {
    const data = await this.request<{ orders?: TikTokOrder[] }>("/order/202309/orders/search", {
      method: "POST",
      query: { page_size: "50" },
      body: {
        create_time_ge: Math.floor(desde.getTime() / 1000),
        create_time_lt: Math.floor(Date.now() / 1000),
      },
    });

    return this.normalizarPedidos(data.orders ?? []);
  }

  async buscarPedidosPorIds(ids: string[]): Promise<PedidoNormalizado[]> {
    const data = await this.request<{ orders?: TikTokOrder[] }>("/order/202309/orders", {
      query: { ids: ids.join(",") },
    });
    return this.normalizarPedidos(data.orders ?? []);
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
      total: order.payment?.total_amount ?? order.payment_info?.total_amount ?? "0",
      frete: order.payment?.shipping_fee,
      itens: (order.line_items ?? []).map((item) => ({
        skuExterno: item.seller_sku,
        quantidade: item.quantity,
        precoUnitario: item.sale_price,
      })),
      criadoEm: new Date(order.create_time * 1000),
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

export function criarTikTokShopProvider(brandSlug: "karzi" | "wuwu"): TikTokShopProvider {
  const upper = brandSlug.toUpperCase() as "KARZI" | "WUWU";
  const appKey = process.env.TIKTOK_APP_KEY;
  const appSecret = process.env.TIKTOK_APP_SECRET;
  const accessToken = process.env[`TIKTOK_ACCESS_TOKEN_${upper}`];
  const shopCipher = process.env[`TIKTOK_SHOP_CIPHER_${upper}`];

  if (!appKey || !appSecret || !accessToken || !shopCipher) {
    throw new Error(`Credenciais TikTok Shop não configuradas para ${upper}.`);
  }
  return new TikTokShopProvider({ appKey, appSecret, accessToken, shopCipher });
}
