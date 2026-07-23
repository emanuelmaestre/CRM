import { createClient } from "@supabase/supabase-js";
import type { ChannelProvider, EstoqueCanalRef, PedidoNormalizado, SaudeConector } from "../domain/ports";

interface MLCredentials {
  clientId: string;
  clientSecret: string;
  accessToken: string;
  refreshToken: string;
}

export class MercadoLivreProvider implements ChannelProvider {
  private readonly baseUrl = "https://api.mercadolibre.com";

  constructor(private readonly creds: MLCredentials) {}

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${this.creds.accessToken}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Mercado Livre HTTP ${res.status} em ${path}`);
    return res.json() as Promise<T>;
  }

  async buscarPedidos(desde: Date): Promise<PedidoNormalizado[]> {
    const me = await this.get<{ id: string }>("/users/me");
    const data = await this.get<{
      results?: Array<{
        id: number;
        status: string;
        total_amount: number;
        shipping?: { cost?: number };
        buyer: { id: number; nickname: string; email?: string };
        order_items: Array<{
          item: { seller_sku?: string };
          quantity: number;
          unit_price: number;
        }>;
        date_created: string;
      }>;
    }>(`/orders/search?seller=${me.id}&order.date_created.from=${encodeURIComponent(desde.toISOString())}&limit=50`);

    return (data.results ?? []).map((order) => ({
      providerOrderId: String(order.id),
      canal: "mercadolivre",
      clienteExternalId: String(order.buyer.id),
      clienteNome: order.buyer.nickname,
      clienteEmail: order.buyer.email,
      status: order.status,
      total: String(order.total_amount),
      frete: order.shipping?.cost === undefined ? undefined : String(order.shipping.cost),
      itens: order.order_items.map((item) => ({
        skuExterno: item.item.seller_sku ?? "",
        quantidade: item.quantity,
        precoUnitario: String(item.unit_price),
      })),
      criadoEm: new Date(order.date_created),
    }));
  }

  async sincronizarEstoque(referencia: EstoqueCanalRef, saldo: number): Promise<void> {
    const res = await fetch(`${this.baseUrl}/items/${referencia.listingId}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${this.creds.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ available_quantity: saldo }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) {
      throw new Error(`Mercado Livre sync estoque HTTP ${res.status} para anúncio ${referencia.listingId}`);
    }
  }

  async consultarEstoque(referencia: EstoqueCanalRef): Promise<number> {
    const item = await this.get<{ available_quantity: number }>(`/items/${referencia.listingId}`);
    if (!Number.isInteger(item.available_quantity) || item.available_quantity < 0) {
      throw new Error(`Mercado Livre retornou saldo inválido para anúncio ${referencia.listingId}.`);
    }
    return item.available_quantity;
  }

  async saude(): Promise<SaudeConector> {
    const inicio = Date.now();
    try {
      await this.get("/users/me");
      return { status: "ok", latenciaMs: Date.now() - inicio, mensagem: "Conectado", verificadoEm: new Date() };
    } catch (error) {
      return { status: "erro", latenciaMs: Date.now() - inicio, mensagem: String(error), verificadoEm: new Date() };
    }
  }
}

export async function obterTokenMercadoLivre(brandSlug: "karzi" | "wuwu"): Promise<{
  accessToken: string;
  refreshToken: string;
}> {
  const upper = brandSlug.toUpperCase() as "KARZI" | "WUWU";
  const orgId = process.env.DEFAULT_ORG_ID;
  const brandId = process.env[`NEXT_PUBLIC_BRAND_ID_${upper}`];
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  let tokenRow: { access_token?: string; refresh_token?: string; expires_at?: string } | null = null;
  if (orgId && brandId && supabaseUrl && serviceRoleKey) {
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const result = await supabase
      .from("canal_tokens")
      .select("access_token, refresh_token, expires_at")
      .eq("org_id", orgId)
      .eq("brand_id", brandId)
      .eq("canal", "mercadolivre")
      .maybeSingle();
    tokenRow = result.data;
  }

  const tokenBancoExpirado = tokenRow?.expires_at
    ? new Date(tokenRow.expires_at).getTime() <= Date.now() + 60_000
    : false;
  const accessToken = tokenBancoExpirado
    ? process.env[`ML_ACCESS_TOKEN_${upper}`]
    : tokenRow?.access_token ?? process.env[`ML_ACCESS_TOKEN_${upper}`];
  const refreshToken = tokenRow?.refresh_token ?? process.env[`ML_REFRESH_TOKEN_${upper}`] ?? "";

  if (!accessToken) {
    const motivo = tokenBancoExpirado ? "token OAuth expirado" : "token ausente";
    throw new Error(`Credencial Mercado Livre indisponível para ${upper}: ${motivo}.`);
  }

  return { accessToken, refreshToken };
}

export async function criarMLProvider(brandSlug: "karzi" | "wuwu"): Promise<MercadoLivreProvider> {
  const upper = brandSlug.toUpperCase() as "KARZI" | "WUWU";
  const clientId = process.env.ML_CLIENT_ID;
  const clientSecret = process.env.ML_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(`Client ID/secret Mercado Livre não configurados para ${upper}.`);
  }

  const { accessToken, refreshToken } = await obterTokenMercadoLivre(brandSlug);
  return new MercadoLivreProvider({ clientId, clientSecret, accessToken, refreshToken });
}
