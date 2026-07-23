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
  private creds: MLCredentials;

  constructor(creds: MLCredentials) {
    this.creds = creds;
  }

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${this.creds.accessToken}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`MercadoLivre HTTP ${res.status} em ${path}`);
    return res.json() as Promise<T>;
  }

  async buscarPedidos(desde: Date): Promise<PedidoNormalizado[]> {
    const me = await this.get<{ id: string }>("/users/me");
    const sellerId = me.id;

    const data = await this.get<{
      results: {
        id: number;
        status: string;
        total_amount: number;
        shipping?: { cost: number };
        buyer: { id: number; nickname: string; email?: string };
        order_items: { item: { seller_sku?: string }; quantity: number; unit_price: number }[];
        date_created: string;
      }[];
    }>(`/orders/search?seller=${sellerId}&order.date_created.from=${desde.toISOString()}&limit=50`);

    return (data.results ?? []).map((o) => ({
      providerOrderId: String(o.id),
      canal: "mercadolivre",
      clienteExternalId: String(o.buyer.id),
      clienteNome: o.buyer.nickname,
      clienteEmail: o.buyer.email,
      status: o.status,
      total: String(o.total_amount),
      frete: o.shipping?.cost ? String(o.shipping.cost) : undefined,
      itens: o.order_items.map((i) => ({
        skuExterno: i.item.seller_sku ?? "",
        quantidade: i.quantity,
        precoUnitario: String(i.unit_price),
      })),
      criadoEm: new Date(o.date_created),
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
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      throw new Error(`MercadoLivre sync estoque HTTP ${res.status} para anúncio ${referencia.listingId}`);
    }
  }

  async consultarEstoque(referencia: EstoqueCanalRef): Promise<number> {
    const item = await this.get<{ available_quantity: number }>(`/items/${referencia.listingId}`);
    if (!Number.isInteger(item.available_quantity) || item.available_quantity < 0) {
      throw new Error(`MercadoLivre retornou saldo inválido para anúncio ${referencia.listingId}.`);
    }
    return item.available_quantity;
  }

  async saude(): Promise<SaudeConector> {
    const inicio = Date.now();
    try {
      await this.get("/users/me");
      return { status: "ok", latenciaMs: Date.now() - inicio, mensagem: "Conectado", verificadoEm: new Date() };
    } catch (err) {
      return { status: "erro", latenciaMs: Date.now() - inicio, mensagem: String(err), verificadoEm: new Date() };
    }
  }
}

// Lê o token do banco (canal_tokens) com fallback para variável de ambiente legada
export async function criarMLProvider(brandSlug: "karzi" | "wuwu"): Promise<MercadoLivreProvider> {
  const upper = brandSlug.toUpperCase() as "KARZI" | "WUWU";
  const clientId     = process.env.ML_CLIENT_ID!;
  const clientSecret = process.env.ML_CLIENT_SECRET!;
  const orgId        = process.env.DEFAULT_ORG_ID!;
  const brandId      = process.env[`NEXT_PUBLIC_BRAND_ID_${upper}`]!;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data } = await supabase
    .from("canal_tokens")
    .select("access_token, refresh_token")
    .eq("org_id", orgId)
    .eq("brand_id", brandId)
    .eq("canal", "mercadolivre")
    .maybeSingle();

  const accessToken  = data?.access_token  ?? process.env[`ML_ACCESS_TOKEN_${upper}`];
  const refreshToken = data?.refresh_token ?? process.env[`ML_REFRESH_TOKEN_${upper}`] ?? "";

  if (!clientId || !clientSecret || !accessToken) {
    throw new Error(`Credenciais Mercado Livre não configuradas para ${upper}.`);
  }

  return new MercadoLivreProvider({ clientId, clientSecret, accessToken, refreshToken });
}
