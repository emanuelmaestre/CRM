import type { ChannelProvider, EstoqueCanalRef, PedidoNormalizado, SaudeConector } from "../domain/ports";

interface OlistCredentials {
  idToken: string;
  sellerId: string;
  baseUrl: string;
}

type OlistOrderItem = {
  id?: string;
  product_sku?: string;
  seller_product_code?: string;
  price?: string;
};

type OlistOrder = {
  code: string;
  status: string;
  seller_id?: string;
  total_amount: string;
  total_freight?: string;
  created_at: string;
  customer?: {
    name?: string;
    document_number?: string;
    phones?: Array<{ phone?: string }>;
  };
  seller_order_items?: OlistOrderItem[];
};

type Paginated<T> = {
  results?: T[];
  next?: string | null;
};

export class OlistProvider implements ChannelProvider {
  constructor(private readonly creds: OlistCredentials) {}

  private async request<T>(
    pathOrUrl: string,
    init: RequestInit = {},
  ): Promise<T> {
    const url = pathOrUrl.startsWith("https://")
      ? pathOrUrl
      : `${this.creds.baseUrl}${pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`}`;
    if (!url.startsWith(`${this.creds.baseUrl}/`)) {
      throw new Error("Olist retornou paginação fora do host configurado.");
    }

    const res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `JWT ${this.creds.idToken}`,
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
      signal: init.signal ?? AbortSignal.timeout(10_000),
    });
    const payload = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(`Olist HTTP ${res.status} em ${new URL(url).pathname}`);
    }
    return payload as T;
  }

  private normalizarPedido(order: OlistOrder): PedidoNormalizado {
    const itensAgrupados = new Map<string, { quantidade: number; precoUnitario: string }>();
    for (const item of order.seller_order_items ?? []) {
      const sku = item.seller_product_code ?? item.product_sku ?? "";
      if (!sku) continue;
      const existente = itensAgrupados.get(sku);
      itensAgrupados.set(sku, {
        quantidade: (existente?.quantidade ?? 0) + 1,
        precoUnitario: item.price ?? existente?.precoUnitario ?? "0",
      });
    }

    return {
      providerOrderId: order.code,
      canal: "olist",
      clienteExternalId: order.customer?.document_number ?? order.code,
      clienteNome: order.customer?.name ?? "Cliente Olist",
      clienteTelefone: order.customer?.phones?.find((item) => item.phone)?.phone,
      status: order.status.toLowerCase(),
      total: order.total_amount,
      frete: order.total_freight,
      itens: [...itensAgrupados].map(([skuExterno, item]) => ({
        skuExterno,
        quantidade: item.quantidade,
        precoUnitario: item.precoUnitario,
      })),
      criadoEm: new Date(order.created_at),
    };
  }

  async buscarPedidos(desde: Date): Promise<PedidoNormalizado[]> {
    const orders: OlistOrder[] = [];
    let next: string | null = "/v1/seller-orders/?ordering=-created_at&page_size=100";
    let paginas = 0;

    while (next && paginas < 10) {
      const page: Paginated<OlistOrder> = await this.request(next);
      const results = (page.results ?? []).filter(
        (order) => !this.creds.sellerId || !order.seller_id || order.seller_id === this.creds.sellerId,
      );
      orders.push(...results);
      paginas++;

      const maisAntigo = results.reduce<Date | null>((valor, order) => {
        const data = new Date(order.created_at);
        return !valor || data < valor ? data : valor;
      }, null);
      if (maisAntigo && maisAntigo < desde) break;
      next = page.next ?? null;
    }

    return orders
      .filter((order) => new Date(order.created_at) >= desde)
      .map((order) => this.normalizarPedido(order));
  }

  async buscarPedidoPorResource(resource: string): Promise<PedidoNormalizado | null> {
    if (!/^\/seller-orders\/[A-Za-z0-9_-]+\/$/.test(resource)) {
      throw new Error("Resource de pedido Olist inválido.");
    }
    const order = await this.request<OlistOrder>(`/v1${resource}`);
    if (this.creds.sellerId && order.seller_id && order.seller_id !== this.creds.sellerId) {
      throw new Error("Pedido Olist não pertence ao seller configurado.");
    }
    return this.normalizarPedido(order);
  }

  async sincronizarEstoque(referencia: EstoqueCanalRef, saldo: number): Promise<void> {
    await this.request(`/v1/seller-products/${encodeURIComponent(referencia.listingId)}/`, {
      method: "PATCH",
      body: JSON.stringify({
        stock: [{ quantity: saldo, availability_days: 0 }],
      }),
      signal: AbortSignal.timeout(8_000),
    });
  }

  async consultarEstoque(referencia: EstoqueCanalRef): Promise<number> {
    const data = await this.request<{ stock?: Array<{ quantity?: number }> }>(
      `/v1/seller-products/${encodeURIComponent(referencia.listingId)}/`,
      { signal: AbortSignal.timeout(8_000) },
    );
    const saldo = (data.stock ?? []).reduce((total, item) => total + Number(item.quantity ?? 0), 0);
    if (!Number.isInteger(saldo) || saldo < 0) {
      throw new Error(`Olist retornou saldo inválido para SKU ${referencia.listingId}.`);
    }
    return saldo;
  }

  async saude(): Promise<SaudeConector> {
    const inicio = Date.now();
    try {
      await this.request("/v1/seller-orders/?page_size=1");
      return { status: "ok", latenciaMs: Date.now() - inicio, mensagem: "Conectado", verificadoEm: new Date() };
    } catch (error) {
      return { status: "erro", latenciaMs: Date.now() - inicio, mensagem: String(error), verificadoEm: new Date() };
    }
  }
}

export function criarOlistProvider(brandSlug: "karzi" | "wuwu"): OlistProvider {
  const upper = brandSlug.toUpperCase() as "KARZI" | "WUWU";
  const idToken = process.env[`OLIST_ID_TOKEN_${upper}`] ?? process.env[`OLIST_API_KEY_${upper}`];
  const sellerId = process.env[`OLIST_SELLER_ID_${upper}`] ?? process.env[`OLIST_SHOP_ID_${upper}`] ?? "";
  const baseUrl = (process.env.OLIST_API_BASE_URL ?? "https://partners-api.olist.com").replace(/\/$/, "");

  if (!idToken || !sellerId) {
    throw new Error(`Credenciais Olist (ID token e seller ID) não configuradas para ${upper}.`);
  }

  return new OlistProvider({ idToken, sellerId, baseUrl });
}
