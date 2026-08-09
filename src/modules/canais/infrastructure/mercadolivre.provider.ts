import { createClient } from "@supabase/supabase-js";
import type { AnuncioCanalDados, ChannelProvider, EstoqueCanalRef, PedidoNormalizado, SaudeConector } from "../domain/ports";
import { brandEnvSuffix, type BrandSlug } from "@/shared/config/brands";

interface MLCredentials {
  clientId: string;
  clientSecret: string;
  accessToken: string;
  refreshToken: string;
}

interface MLAttribute {
  id?: string;
  value_name?: string | null;
  values?: Array<{ name?: string | null }>;
}

interface MLVariation {
  id: number;
  price?: number;
  available_quantity?: number;
  seller_custom_field?: string | null;
  attributes?: MLAttribute[];
  attribute_combinations?: Array<{ name?: string; value_name?: string | null }>;
}

interface MLItemDetail {
  id: string;
  price?: number;
  title?: string;
  status?: string;
  permalink?: string;
  available_quantity?: number;
  seller_custom_field?: string | null;
  attributes?: MLAttribute[];
  variations?: MLVariation[];
}

interface MLOrderDetail {
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
}

export interface MLAnuncioCatalogo {
  listingId: string;
  variationId: string | null;
  externalSku: string | null;
  title: string;
  variationLabel: string | null;
  availableQuantity: number;
  price: string;
  status: string;
  permalink: string | null;
  // Nota é por anúncio (item), não por variação — o Mercado Livre não separa
  // avaliação por variação. Null quando a consulta falhou ou não há opiniões.
  ratingAverage: number | null;
  reviewsTotal: number | null;
}

/** Reclamação bruta do endpoint de claims do pós-venda. */
interface MLClaimDetail {
  id?: number | string;
  status?: string;
  stage?: string;
  reason_id?: string;
  resource?: string;
  resource_id?: number | string;
  date_created?: string;
  last_updated?: string;
}

export interface MLReclamacao {
  id: string;
  status: string;
  estagio: string | null;
  motivo: string | null;
  pedidoExternoId: string | null;
  abertaEm: string | null;
  atualizadaEm: string | null;
}

type MLRatings = ReadonlyMap<string, { ratingAverage: number | null; reviewsTotal: number | null }>;

function skuDosAtributos(attributes?: MLAttribute[]): string | null {
  const atributo = attributes?.find((item) => item.id === "SELLER_SKU");
  return atributo?.value_name?.trim()
    || atributo?.values?.find((item) => item.name?.trim())?.name?.trim()
    || null;
}

export function normalizarCatalogoMercadoLivre(items: MLItemDetail[], ratings: MLRatings = new Map()): MLAnuncioCatalogo[] {
  return items.flatMap<MLAnuncioCatalogo>((item): MLAnuncioCatalogo[] => {
    const skuItem = skuDosAtributos(item.attributes) || item.seller_custom_field?.trim() || null;
    const rating = ratings.get(item.id) ?? { ratingAverage: null, reviewsTotal: null };
    const variations = item.variations ?? [];
    if (variations.length === 0) {
      return [{
        listingId: item.id,
        variationId: null,
        externalSku: skuItem,
        title: item.title ?? item.id,
        variationLabel: null,
        availableQuantity: item.available_quantity ?? 0,
        price: String(item.price ?? 0),
        status: item.status ?? "unknown",
        permalink: item.permalink ?? null,
        ...rating,
      }];
    }

    return variations.map((variation) => ({
      listingId: item.id,
      variationId: String(variation.id),
      externalSku: skuDosAtributos(variation.attributes)
        || variation.seller_custom_field?.trim()
        || skuItem,
      title: item.title ?? item.id,
      variationLabel: variation.attribute_combinations
        ?.map((attribute) => attribute.value_name || attribute.name)
        .filter(Boolean)
        .join(" / ") || null,
      availableQuantity: variation.available_quantity ?? 0,
      price: String(variation.price ?? item.price ?? 0),
      status: item.status ?? "unknown",
      permalink: item.permalink ?? null,
      ...rating,
    }));
  });
}

export function normalizarPedidoMercadoLivre(order: MLOrderDetail): PedidoNormalizado {
  return {
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
  };
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

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.creds.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const detail = (await res.text()).replace(/[\r\n]+/g, " ").slice(0, 300);
      throw new Error(`Mercado Livre HTTP ${res.status} em ${path}: ${detail}`);
    }
    return res.json() as Promise<T>;
  }

  async responderPergunta(questionId: string, texto: string): Promise<{ questionId: string; status: string }> {
    const questionIdNumber = Number(questionId);
    if (!Number.isSafeInteger(questionIdNumber) || questionIdNumber <= 0) {
      throw new Error("ID da pergunta do Mercado Livre inválido.");
    }
    const resposta = await this.post<{ id?: number; status?: string }>("/answers", {
      question_id: questionIdNumber,
      text: texto,
    });
    return { questionId: String(resposta.id ?? questionIdNumber), status: resposta.status ?? "ANSWERED" };
  }

  async enviarMensagemPosVenda(input: {
    packId: string;
    sellerId: string;
    texto: string;
  }): Promise<{ providerMessageId: string }> {
    const path = `/messages/packs/${encodeURIComponent(input.packId)}/sellers/${encodeURIComponent(input.sellerId)}?tag=post_sale`;
    const resposta = await this.post<{ message_id?: string; id?: string }>(path, {
      from: { user_id: input.sellerId },
      // Desde 02/02/2026, o fluxo MLB intermediado usa o agente de mensageria.
      to: { user_id: "3037675074" },
      text: input.texto,
    });
    const providerMessageId = resposta.message_id ?? resposta.id;
    if (!providerMessageId) throw new Error("Mercado Livre não retornou o ID da mensagem enviada.");
    return { providerMessageId };
  }

  async buscarPedidos(desde: Date): Promise<PedidoNormalizado[]> {
    const me = await this.get<{ id: string }>("/users/me");
    const data = await this.get<{
      results?: MLOrderDetail[];
    }>(`/orders/search?seller=${me.id}&order.date_created.from=${encodeURIComponent(desde.toISOString())}&limit=50`);

    return (data.results ?? []).map(normalizarPedidoMercadoLivre);
  }

  async listarPedidosHistoricos(opcoes: {
    de: Date;
    ate: Date;
    offset?: number;
    limit?: number;
  }): Promise<{ pedidos: PedidoNormalizado[]; total: number; offset: number; limit: number }> {
    const offset = Math.max(0, Math.trunc(opcoes.offset ?? 0));
    const limit = Math.min(50, Math.max(1, Math.trunc(opcoes.limit ?? 50)));
    const me = await this.get<{ id: string }>("/users/me");
    const params = new URLSearchParams({
      seller: me.id,
      "order.date_created.from": opcoes.de.toISOString(),
      "order.date_created.to": opcoes.ate.toISOString(),
      sort: "date_asc",
      offset: String(offset),
      limit: String(limit),
    });
    const data = await this.get<{
      results?: MLOrderDetail[];
      paging?: { total?: number; offset?: number; limit?: number };
    }>(`/orders/search?${params.toString()}`);

    return {
      pedidos: (data.results ?? []).map(normalizarPedidoMercadoLivre),
      total: data.paging?.total ?? data.results?.length ?? 0,
      offset: data.paging?.offset ?? offset,
      limit: data.paging?.limit ?? limit,
    };
  }

  // Nota do produto é read-only na API do ML — não há endpoint pra solicitar
  // ou escrever avaliação, só consultar o que já existe. Falha por item não
  // derruba o catálogo inteiro: fica sem nota, o resto segue normal.
  private async buscarAvaliacoes(itemIds: string[]): Promise<MLRatings> {
    const unicos = [...new Set(itemIds)];
    const resultados = await Promise.all(unicos.map(async (id) => {
      try {
        const data = await this.get<{ rating_average?: number; reviews?: unknown[]; paging?: { total?: number } }>(
          `/reviews/item/${encodeURIComponent(id)}`,
        );
        return [id, {
          ratingAverage: typeof data.rating_average === "number" ? data.rating_average : null,
          reviewsTotal: data.paging?.total ?? (Array.isArray(data.reviews) ? data.reviews.length : null),
        }] as const;
      } catch {
        return [id, { ratingAverage: null, reviewsTotal: null }] as const;
      }
    }));
    return new Map(resultados);
  }

  async listarAnunciosAtivos(opcoes: { offset?: number; limit?: number } = {}): Promise<{
    items: MLAnuncioCatalogo[];
    totalListings: number;
    offset: number;
    limit: number;
  }> {
    const offset = Math.max(0, Math.trunc(opcoes.offset ?? 0));
    const limit = Math.min(50, Math.max(1, Math.trunc(opcoes.limit ?? 50)));
    const me = await this.get<{ id: string }>("/users/me");
    const search = await this.get<{
      results?: string[];
      paging?: { total?: number; offset?: number; limit?: number };
    }>(`/users/${encodeURIComponent(me.id)}/items/search?status=active&offset=${offset}&limit=${limit}`);
    const ids = search.results ?? [];
    if (ids.length === 0) {
      return { items: [], totalListings: search.paging?.total ?? 0, offset, limit };
    }

    const batches: string[][] = [];
    for (let index = 0; index < ids.length; index += 20) batches.push(ids.slice(index, index + 20));
    const responses = await Promise.all(batches.map((batch) => this.get<Array<{
      code: number;
      body?: MLItemDetail;
    }>>(`/items?ids=${batch.map(encodeURIComponent).join(",")}&include_attributes=all`)));
    const details = responses
      .flat()
      .filter((response) => response.code === 200 && response.body)
      .map((response) => response.body as MLItemDetail);

    const ratings = await this.buscarAvaliacoes(details.map((item) => item.id));

    return {
      items: normalizarCatalogoMercadoLivre(details, ratings),
      totalListings: search.paging?.total ?? ids.length,
      offset,
      limit,
    };
  }

  // Reclamações (claims) do pós-venda. São read-only aqui: o dashboard só
  // aponta o que existe em aberto — tratar/responder continua sendo feito no
  // painel do Mercado Livre, que tem o fluxo de mediação completo.
  async listarReclamacoesAbertas(): Promise<MLReclamacao[]> {
    const data = await this.get<{ data?: MLClaimDetail[] }>(
      "/post-purchase/v1/claims/search?status=opened&limit=50&sort=date_created,desc",
    );
    return (data.data ?? []).map((claim) => ({
      id: String(claim.id),
      status: claim.status ?? "opened",
      estagio: claim.stage ?? null,
      motivo: claim.reason_id ?? null,
      pedidoExternoId: claim.resource === "order" && claim.resource_id !== undefined
        ? String(claim.resource_id)
        : null,
      abertaEm: claim.date_created ?? null,
      atualizadaEm: claim.last_updated ?? null,
    }));
  }

  async sincronizarEstoque(referencia: EstoqueCanalRef, saldo: number): Promise<void> {
    const variationId = referencia.warehouseId ? Number(referencia.warehouseId) : null;
    if (referencia.warehouseId && !Number.isSafeInteger(variationId)) {
      throw new Error(`Variação Mercado Livre inválida: ${referencia.warehouseId}.`);
    }
    const res = await fetch(`${this.baseUrl}/items/${referencia.listingId}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${this.creds.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(variationId
        ? { variations: [{ id: variationId, available_quantity: saldo }] }
        : { available_quantity: saldo }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) {
      throw new Error(`Mercado Livre sync estoque HTTP ${res.status} para anúncio ${referencia.listingId}`);
    }
  }

  async sincronizarAnuncio(referencia: EstoqueCanalRef, dados: AnuncioCanalDados): Promise<void> {
    const variationId = referencia.warehouseId ? Number(referencia.warehouseId) : null;
    if (referencia.warehouseId && !Number.isSafeInteger(variationId)) {
      throw new Error(`Variação Mercado Livre inválida: ${referencia.warehouseId}.`);
    }
    const precoCentavos = Number(dados.preco);
    if (!Number.isFinite(precoCentavos) || precoCentavos <= 0) {
      throw new Error(`Preço inválido para sincronizar anúncio ${referencia.listingId}: ${dados.preco}.`);
    }
    // O título é sempre do anúncio (item), não da variação — o Mercado Livre
    // não permite título por variação. O preço vai na variação quando existe.
    const body = variationId
      ? { title: dados.titulo, variations: [{ id: variationId, price: precoCentavos }] }
      : { title: dados.titulo, price: precoCentavos };
    const res = await fetch(`${this.baseUrl}/items/${referencia.listingId}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${this.creds.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) {
      throw new Error(`Mercado Livre sync anúncio HTTP ${res.status} para anúncio ${referencia.listingId}`);
    }
  }

  async consultarEstoque(referencia: EstoqueCanalRef): Promise<number> {
    const item = await this.get<{
      available_quantity: number;
      variations?: Array<{ id: number; available_quantity: number }>;
    }>(`/items/${referencia.listingId}`);
    const variationId = referencia.warehouseId ? Number(referencia.warehouseId) : null;
    const saldo = variationId
      ? item.variations?.find((variation) => variation.id === variationId)?.available_quantity
      : item.available_quantity;
    if (!Number.isInteger(saldo) || (saldo ?? -1) < 0) {
      throw new Error(`Mercado Livre retornou saldo inválido para anúncio ${referencia.listingId}.`);
    }
    return saldo as number;
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

export async function obterTokenMercadoLivre(brandSlug: BrandSlug): Promise<{
  accessToken: string;
  refreshToken: string;
}> {
  const upper = brandEnvSuffix(brandSlug);
  const orgId = process.env.DEFAULT_ORG_ID;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  let tokenRow: { access_token?: string; refresh_token?: string; expires_at?: string } | null = null;
  if (orgId && supabaseUrl && serviceRoleKey) {
    const supabase = createClient(supabaseUrl, serviceRoleKey);
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
        .select("access_token, refresh_token, expires_at")
        .eq("org_id", orgId)
        .eq("brand_id", marca.data.id)
        .eq("canal", "mercadolivre")
        .maybeSingle();
      tokenRow = result.data;
    }
  }

  const tokenBancoExpirado = tokenRow?.expires_at
    ? new Date(tokenRow.expires_at).getTime() <= Date.now() + 60_000
    : false;
  const accessToken = tokenBancoExpirado
    ? process.env[`ML_ACCESS_TOKEN_${upper}`]
    : tokenRow?.access_token ?? process.env[`ML_ACCESS_TOKEN_${upper}`];
  const refreshToken = tokenRow?.refresh_token ?? process.env[`ML_REFRESH_TOKEN_${upper}`] ?? "";

  if (accessToken && (!tokenRow || tokenBancoExpirado)) {
    const motivo = tokenRow ? "token OAuth em canal_tokens expirado" : "nenhum token persistido em canal_tokens";
    console.warn(
      `[mercadolivre] usando ML_ACCESS_TOKEN_${upper} do ambiente (${motivo}). ` +
      "Esse fallback não é renovado pelo job de refresh automático (A23) — reconecte via OAuth em /configuracoes assim que possível.",
    );
  }

  if (!accessToken) {
    const motivo = tokenBancoExpirado ? "token OAuth expirado" : "token ausente";
    throw new Error(`Credencial Mercado Livre indisponível para ${upper}: ${motivo}.`);
  }

  return { accessToken, refreshToken };
}

export async function criarMLProvider(brandSlug: BrandSlug): Promise<MercadoLivreProvider> {
  const upper = brandEnvSuffix(brandSlug);
  const clientId = process.env.ML_CLIENT_ID;
  const clientSecret = process.env.ML_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(`Client ID/secret Mercado Livre não configurados para ${upper}.`);
  }

  const { accessToken, refreshToken } = await obterTokenMercadoLivre(brandSlug);
  return new MercadoLivreProvider({ clientId, clientSecret, accessToken, refreshToken });
}
