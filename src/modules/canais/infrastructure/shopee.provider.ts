import crypto from "crypto";
import type { ChannelProvider, PedidoNormalizado, SaudeConector } from "../domain/ports";

interface ShopeeCredentials {
  partnerId: string;
  partnerKey: string;
  shopId: string;
  accessToken: string;
}

export class ShopeeProvider implements ChannelProvider {
  private readonly baseUrl = "https://partner.shopeemobile.com/api/v2";
  private creds: ShopeeCredentials;

  constructor(creds: ShopeeCredentials) {
    this.creds = creds;
  }

  private assinar(path: string, timestamp: number): string {
    const base = `${this.creds.partnerId}${path}${timestamp}${this.creds.accessToken}${this.creds.shopId}`;
    return crypto.createHmac("sha256", this.creds.partnerKey).update(base).digest("hex");
  }

  private url(path: string, params: Record<string, string | number> = {}): string {
    const ts = Math.floor(Date.now() / 1000);
    const sign = this.assinar(path, ts);
    const qs = new URLSearchParams({
      partner_id: this.creds.partnerId,
      shop_id: this.creds.shopId,
      access_token: this.creds.accessToken,
      timestamp: String(ts),
      sign,
      ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
    });
    return `${this.baseUrl}${path}?${qs}`;
  }

  async buscarPedidos(desde: Date): Promise<PedidoNormalizado[]> {
    const timeFrom = Math.floor(desde.getTime() / 1000);
    const timeTo = Math.floor(Date.now() / 1000);

    const listRes = await fetch(this.url("/order/get_order_list", {
      time_range_field: "create_time",
      time_from: timeFrom,
      time_to: timeTo,
      page_size: 50,
      response_optional_fields: "buyer_username,total_amount",
    }), { signal: AbortSignal.timeout(10000) });

    if (!listRes.ok) throw new Error(`Shopee HTTP ${listRes.status} em get_order_list`);
    const listData = await listRes.json() as {
      response?: { order_list?: { order_sn: string; order_status: string; total_amount: number; buyer_username: string; create_time: number }[] };
    };

    const orders = listData.response?.order_list ?? [];
    if (orders.length === 0) return [];

    // Busca detalhes (itens de linha) em lote — máx 50 por chamada
    const sns = orders.map((o) => o.order_sn).join(",");
    const detailRes = await fetch(this.url("/order/get_order_detail", {
      order_sn_list: sns,
      response_optional_fields: "item_list,recipient_address,buyer_user_id",
    }), { signal: AbortSignal.timeout(15000) });

    type ShopeeItem = { item_sku: string; model_quantity_purchased: number; model_discounted_price: number };
    type ShopeeDetail = {
      order_sn: string;
      recipient_address?: { name: string; phone?: string };
      item_list?: ShopeeItem[];
    };

    const detailMap = new Map<string, ShopeeDetail>();
    if (detailRes.ok) {
      const detailData = await detailRes.json() as { response?: { order_list?: ShopeeDetail[] } };
      for (const d of detailData.response?.order_list ?? []) {
        detailMap.set(d.order_sn, d);
      }
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

  async sincronizarEstoque(skuExterno: string, saldo: number): Promise<void> {
    await fetch(this.url("/product/update_stock"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ item_list: [{ item_id: Number(skuExterno), normal_stock: saldo }] }),
      signal: AbortSignal.timeout(8000),
    });
  }

  async saude(): Promise<SaudeConector> {
    const inicio = Date.now();
    try {
      const res = await fetch(this.url("/shop/get_shop_info"), { signal: AbortSignal.timeout(5000) });
      const latenciaMs = Date.now() - inicio;
      if (!res.ok) return { status: "degradado", latenciaMs, mensagem: `HTTP ${res.status}`, verificadoEm: new Date() };
      return { status: "ok", latenciaMs, mensagem: "Conectado", verificadoEm: new Date() };
    } catch (err) {
      return { status: "erro", latenciaMs: Date.now() - inicio, mensagem: String(err), verificadoEm: new Date() };
    }
  }
}

export function criarShopeeProvider(brandSlug: "karzi" | "wuwu"): ShopeeProvider {
  const upper = brandSlug.toUpperCase() as "KARZI" | "WUWU";
  const partnerId = process.env.SHOPEE_PARTNER_ID;
  const partnerKey = process.env.SHOPEE_PARTNER_KEY;
  const shopId = process.env[`SHOPEE_SHOP_ID_${upper}`];
  const accessToken = process.env[`SHOPEE_ACCESS_TOKEN_${upper}`];

  if (!partnerId || !partnerKey || !shopId || !accessToken) {
    throw new Error(`Credenciais Shopee não configuradas para ${upper}.`);
  }

  return new ShopeeProvider({ partnerId, partnerKey, shopId, accessToken });
}
