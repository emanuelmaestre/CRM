import crypto from "crypto";
import type { ChannelProvider, PedidoNormalizado, SaudeConector } from "../domain/ports";

interface TikTokCredentials {
  appKey: string;
  appSecret: string;
  accessToken: string;
  shopId: string;
}

export class TikTokShopProvider implements ChannelProvider {
  private readonly baseUrl = "https://open-api.tiktokglobalshop.com";
  private creds: TikTokCredentials;

  constructor(creds: TikTokCredentials) {
    this.creds = creds;
  }

  private assinar(path: string, params: Record<string, string>, timestamp: number): string {
    const sortedParams = Object.keys(params)
      .filter((k) => k !== "sign" && k !== "access_token")
      .sort()
      .map((k) => `${k}${params[k]}`)
      .join("");

    const base = `${this.creds.appSecret}${path}${sortedParams}${timestamp}`;
    return crypto.createHmac("sha256", this.creds.appSecret).update(base).digest("hex");
  }

  private buildRequest(path: string, extra: Record<string, string> = {}): string {
    const timestamp = Math.floor(Date.now() / 1000);
    const baseParams: Record<string, string> = {
      app_key: this.creds.appKey,
      shop_id: this.creds.shopId,
      timestamp: String(timestamp),
      access_token: this.creds.accessToken,
      ...extra,
    };
    const sign = this.assinar(path, baseParams, timestamp);
    const qs = new URLSearchParams({ ...baseParams, sign });
    return `${this.baseUrl}${path}?${qs}`;
  }

  async buscarPedidos(desde: Date): Promise<PedidoNormalizado[]> {
    const url = this.buildRequest("/order/202309/orders/search", {
      create_time_ge: String(Math.floor(desde.getTime() / 1000)),
      create_time_lt: String(Math.floor(Date.now() / 1000)),
      page_size: "50",
    });

    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`TikTok Shop HTTP ${res.status}`);

    const data = await res.json() as {
      data?: {
        orders?: {
          id: string;
          status: string;
          payment_info?: { total_amount: string };
          recipient_address?: { name: string };
          buyer_uid: string;
          create_time: number;
          line_items?: { seller_sku: string; quantity: number; sale_price: string }[];
        }[];
      };
    };

    return (data.data?.orders ?? []).map((o) => ({
      providerOrderId: o.id,
      canal: "tiktokshop",
      clienteExternalId: o.buyer_uid,
      clienteNome: o.recipient_address?.name ?? o.buyer_uid,
      status: o.status.toLowerCase(),
      total: o.payment_info?.total_amount ?? "0",
      itens: (o.line_items ?? []).map((i) => ({
        skuExterno: i.seller_sku,
        quantidade: i.quantity,
        precoUnitario: i.sale_price,
      })),
      criadoEm: new Date(o.create_time * 1000),
    }));
  }

  async sincronizarEstoque(skuExterno: string, saldo: number): Promise<void> {
    const url = this.buildRequest("/product/202309/products/stocks");
    await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        skus: [{ id: skuExterno, seller_sku: skuExterno, stock_infos: [{ available_stock: saldo }] }],
      }),
      signal: AbortSignal.timeout(8000),
    });
  }

  async saude(): Promise<SaudeConector> {
    const inicio = Date.now();
    try {
      const url = this.buildRequest("/seller/202309/shops");
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      const latenciaMs = Date.now() - inicio;
      if (!res.ok) return { status: "degradado", latenciaMs, mensagem: `HTTP ${res.status}`, verificadoEm: new Date() };
      return { status: "ok", latenciaMs, mensagem: "Conectado", verificadoEm: new Date() };
    } catch (err) {
      return { status: "erro", latenciaMs: Date.now() - inicio, mensagem: String(err), verificadoEm: new Date() };
    }
  }
}

export function criarTikTokShopProvider(brandSlug: "karzi" | "wuwu"): TikTokShopProvider {
  const upper = brandSlug.toUpperCase() as "KARZI" | "WUWU";
  const appKey = process.env.TIKTOK_APP_KEY;
  const appSecret = process.env.TIKTOK_APP_SECRET;
  const accessToken = process.env[`TIKTOK_ACCESS_TOKEN_${upper}`];
  const shopId = process.env[`TIKTOK_SHOP_ID_${upper}`];

  if (!appKey || !appSecret || !accessToken || !shopId) {
    throw new Error(`Credenciais TikTok Shop não configuradas para ${upper}.`);
  }

  return new TikTokShopProvider({ appKey, appSecret, accessToken, shopId });
}
