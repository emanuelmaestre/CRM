import crypto from "crypto";
import type { ChannelProvider, EstoqueCanalRef, PedidoNormalizado, SaudeConector } from "../domain/ports";
import { shopeeFetch } from "@/shared/lib/shopee-proxy";
import { brandEnvSuffix, type BrandSlug } from "@/shared/config/brands";

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

export function criarShopeeProvider(brandSlug: BrandSlug): ShopeeProvider {
  const upper = brandEnvSuffix(brandSlug);
  const partnerId = process.env.SHOPEE_PARTNER_ID;
  const partnerKey = process.env.SHOPEE_PARTNER_KEY;
  const shopId = process.env[`SHOPEE_SHOP_ID_${upper}`];
  const accessToken = process.env[`SHOPEE_ACCESS_TOKEN_${upper}`];

  if (!partnerId || !partnerKey || !shopId || !accessToken) {
    throw new Error(`Credenciais Shopee não configuradas para ${upper}.`);
  }

  return new ShopeeProvider({ partnerId, partnerKey, shopId, accessToken });
}
