import type { ChannelProvider, PedidoNormalizado, SaudeConector } from "../domain/ports";

interface OlistCredentials {
  apiKey: string;
  shopId: string;
}

export class OlistProvider implements ChannelProvider {
  private readonly baseUrl = "https://erp.olist.com/api/v1";
  private creds: OlistCredentials;

  constructor(creds: OlistCredentials) {
    this.creds = creds;
  }

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      headers: {
        Authorization: `Token ${this.creds.apiKey}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`Olist HTTP ${res.status} em ${path}`);
    return res.json() as Promise<T>;
  }

  async buscarPedidos(desde: Date): Promise<PedidoNormalizado[]> {
    const dataFrom = desde.toISOString().split("T")[0];
    const data = await this.get<{
      results: {
        order_number: string;
        status: string;
        total_amount: number;
        freight_amount?: number;
        customer: { name: string; email?: string; phone?: string };
        created_at: string;
        items: { seller_sku: string; quantity: number; unit_price: number }[];
      }[];
    }>(`/orders/?created_at__gte=${dataFrom}&page_size=50`);

    return (data.results ?? []).map((o) => ({
      providerOrderId: o.order_number,
      canal: "olist",
      clienteExternalId: o.customer.email ?? o.customer.phone ?? o.order_number,
      clienteNome: o.customer.name,
      clienteEmail: o.customer.email,
      clienteTelefone: o.customer.phone,
      status: o.status.toLowerCase(),
      total: String(o.total_amount),
      frete: o.freight_amount ? String(o.freight_amount) : undefined,
      itens: o.items.map((i) => ({
        skuExterno: i.seller_sku,
        quantidade: i.quantity,
        precoUnitario: String(i.unit_price),
      })),
      criadoEm: new Date(o.created_at),
    }));
  }

  async sincronizarEstoque(skuExterno: string, saldo: number): Promise<void> {
    const res = await fetch(`${this.baseUrl}/products/${skuExterno}/stocks/`, {
      method: "PATCH",
      headers: {
        Authorization: `Token ${this.creds.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ quantity: saldo }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`Olist sync estoque HTTP ${res.status} para SKU ${skuExterno}`);
  }

  async saude(): Promise<SaudeConector> {
    const inicio = Date.now();
    try {
      await this.get("/orders/?page_size=1");
      return { status: "ok", latenciaMs: Date.now() - inicio, mensagem: "Conectado", verificadoEm: new Date() };
    } catch (err) {
      return { status: "erro", latenciaMs: Date.now() - inicio, mensagem: String(err), verificadoEm: new Date() };
    }
  }
}

export function criarOlistProvider(brandSlug: "karzi" | "wuwu"): OlistProvider {
  const upper = brandSlug.toUpperCase() as "KARZI" | "WUWU";
  const apiKey = process.env[`OLIST_API_KEY_${upper}`];
  const shopId = process.env[`OLIST_SHOP_ID_${upper}`] ?? "";

  if (!apiKey) {
    throw new Error(`Credenciais Olist não configuradas para ${upper}.`);
  }

  return new OlistProvider({ apiKey, shopId });
}
