import { createClient } from "@supabase/supabase-js";
import type {
  AnuncioCanalDados, ChannelProvider, EnderecoEntregaNormalizado, EstoqueCanalRef, PedidoNormalizado, SaudeConector,
} from "../domain/ports";
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
  // O search de pedidos só traz o id do envio — o endereço em si exige uma
  // segunda chamada a /shipments/{id} (ver buscarEnderecoEntrega abaixo).
  shipping?: { id?: number; cost?: number };
  buyer: { id: number; nickname: string; email?: string };
  order_items: Array<{
    item: { seller_sku?: string; title?: string };
    quantity: number;
    unit_price: number;
    // Comissão do Mercado Livre por unidade do item — já vem nesta mesma
    // resposta, não é uma chamada extra. Ausente em pedidos muito antigos.
    sale_fee?: number;
  }>;
  date_created: string;
  pack_id?: number | null;
}

/** Resposta de GET /shipments/{id} — só o campo receiver_address importa aqui.
 *  Verificado com um pedido real (scripts/inspecionar-pedido-ml.mjs): nome e
 *  endereço completo vêm sem máscara nenhuma; só receiver_phone é mascarado
 *  ("XXXXXXX"), por isso ele nem entra neste tipo — não vale a pena capturar
 *  um valor que a própria API já esconde. */
interface MLReceiverAddress {
  receiver_name?: string;
  street_name?: string;
  street_number?: string;
  comment?: string | null;
  neighborhood?: { name?: string | null };
  city?: { name?: string | null };
  state?: { name?: string | null };
  zip_code?: string;
  latitude?: number;
  longitude?: number;
}

/** Bloco `seller_reputation` que já vem embutido na resposta de GET /users/me.
 *  Todos os campos são opcionais de propósito: vendedor recém-criado ainda não
 *  tem termômetro (level_id vem null) e conta sem venda no período não traz o
 *  bloco `metrics`. */
interface MLSellerReputationRaw {
  level_id?: string | null;
  power_seller_status?: string | null;
  transactions?: {
    completed?: number;
    canceled?: number;
    total?: number;
    ratings?: { positive?: number; neutral?: number; negative?: number };
  };
  metrics?: {
    claims?: { period?: string; rate?: number; value?: number };
    cancellations?: { period?: string; rate?: number; value?: number };
    delayed_handling_time?: { period?: string; rate?: number; value?: number };
    sales?: { period?: string; completed?: number };
  };
}

/** Reputação normalizada: taxas já em percentual (0–100), nunca em fração. */
export interface MLReputacao {
  sellerId: string;
  nickname: string | null;
  pontos: number | null;
  /** "1_red" … "5_green". Null enquanto o vendedor não tem termômetro. */
  nivelId: string | null;
  /** "platinum" | "gold" | "silver" — o selo de Mercado Líder, quando há. */
  statusMercadoLider: string | null;
  vendasConcluidas: number | null;
  taxaReclamacao: number | null;
  taxaCancelamento: number | null;
  taxaAtrasoEnvio: number | null;
  reclamacoesPeriodo: number | null;
  cancelamentosPeriodo: number | null;
  atrasosPeriodo: number | null;
  /** Janela que o próprio ML usou ("365 days", "60 days"…). */
  periodoMetricas: string | null;
  avaliacaoPositiva: number | null;
  avaliacaoNeutra: number | null;
  avaliacaoNegativa: number | null;
}

export interface MLVisitasItem {
  itemId: string;
  total: number;
}

export interface MLPerformanceItem {
  itemId: string;
  entityId: string;
  score: number;
  nivel: string | null;
  calculadoEm: string | null;
  pendencias: string[];
}

/** 0.0123 → 1.23. Preserva o null: "sem dado" e "zero por cento" são coisas
 *  diferentes, e arredondar um pra outro esconderia conta nova sem histórico. */
function fracaoParaPercentual(valor: number | null | undefined): number | null {
  if (typeof valor !== "number" || !Number.isFinite(valor)) return null;
  return Math.round(valor * 1000) / 10;
}

/** Mensagem bruta de GET /messages/packs/{packId}/sellers/{sellerId}. */
interface MLPackMessageRaw {
  message_id?: string;
  id?: string;
  message_date?: { received?: string; available?: string; created?: string };
  from?: { user_id?: number };
  to?: { user_id?: number };
  text?: string;
  subject?: string;
}

/** Mensagem pós-venda normalizada, usada pra popular a aba Conversas sem
 *  depender só do webhook (chegada passiva) — busca ativa dos pedidos
 *  recentes e das trocas de mensagem de cada um. */
export interface MLMensagemPosVenda {
  packId: string;
  orderId: string;
  providerMessageId: string;
  texto: string;
  remetenteId: number | null;
  remetenteNome: string | null;
  produtos: string[];
  destinatarioId: number | null;
  criadaEm: string | null;
  deVendedor: boolean;
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
  // Distribuição por estrela e as opiniões em si vêm na mesma resposta da nota;
  // aproveitá-las não custa requisição nenhuma.
  ratingLevels: MLDistribuicaoNotas | null;
  opinioes: MLOpiniao[];
}

/** Opinião de um comprador sobre o produto. Leitura apenas: a API do Mercado
 *  Livre não expõe endpoint para o vendedor responder uma opinião. */
export interface MLOpiniao {
  id: string;
  titulo: string | null;
  conteudo: string | null;
  nota: number;
  criadaEm: string | null;
}

/** Quantidade de opiniões por estrela, de 1 a 5. */
export interface MLDistribuicaoNotas {
  uma: number;
  duas: number;
  tres: number;
  quatro: number;
  cinco: number;
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

/** Mensagem bruta de GET /post-purchase/v1/claims/{id}/messages. */
interface MLClaimMessageRaw {
  sender_role?: string;
  receiver_role?: string;
  message?: string;
  date_created?: string;
  status?: string;
}

/** Uma mensagem dentro de uma reclamação — troca entre comprador, vendedor e,
 *  se escalou, o mediador do Mercado Livre. */
export interface MLReclamacaoMensagem {
  remetente: "complainant" | "respondent" | "mediator" | string;
  destinatario: "complainant" | "respondent" | "mediator" | string;
  texto: string;
  criadaEm: string | null;
}

/** Para quem a resposta do vendedor (respondent) pode ir, conforme a etapa da
 *  reclamação — ver tabela "available_actions" na documentação oficial. */
export type MLReclamacaoDestinatario = "complainant" | "mediator";

export interface MLReclamacao {
  id: string;
  status: string;
  estagio: string | null;
  motivo: string | null;
  pedidoExternoId: string | null;
  abertaEm: string | null;
  atualizadaEm: string | null;
}

type MLRating = {
  ratingAverage: number | null;
  reviewsTotal: number | null;
  ratingLevels: MLDistribuicaoNotas | null;
  opinioes: MLOpiniao[];
};

const SEM_AVALIACAO: MLRating = {
  ratingAverage: null,
  reviewsTotal: null,
  ratingLevels: null,
  opinioes: [],
};

type MLRatings = ReadonlyMap<string, MLRating>;

/** Resposta crua de GET /reviews/item/{id}. */
interface MLReviewsResponse {
  rating_average?: number;
  paging?: { total?: number };
  rating_levels?: Record<string, unknown>;
  reviews?: Array<{
    id?: number | string;
    title?: string;
    content?: string;
    rate?: number;
    status?: string;
    date_created?: string;
  }>;
}

/** Quantas opiniões guardamos por anúncio. A API devolve as mais relevantes;
 *  além disso o payload cresce sem o operador conseguir ler tudo. */
const MAX_OPINIOES_POR_ANUNCIO = 20;

function contar(valor: unknown): number {
  return typeof valor === "number" && Number.isFinite(valor) ? valor : 0;
}

function textoOuNulo(valor: string | undefined): string | null {
  const limpo = valor?.trim();
  return limpo ? limpo : null;
}

export function normalizarAvaliacoesItem(data: MLReviewsResponse): MLRating {
  const brutas = Array.isArray(data.reviews) ? data.reviews : [];
  const niveis = data.rating_levels;

  const opinioes = brutas
    // Só opinião publicada e com algo escrito — estrela sem texto já está na média.
    .filter((review) => (review.status ?? "published") === "published")
    .map((review): MLOpiniao => ({
      id: String(review.id ?? ""),
      titulo: textoOuNulo(review.title),
      conteudo: textoOuNulo(review.content),
      nota: contar(review.rate),
      criadaEm: textoOuNulo(review.date_created),
    }))
    .filter((opiniao) => opiniao.id && (opiniao.titulo || opiniao.conteudo))
    .sort((a, b) => (b.criadaEm ?? "").localeCompare(a.criadaEm ?? ""))
    .slice(0, MAX_OPINIOES_POR_ANUNCIO);

  return {
    ratingAverage: typeof data.rating_average === "number" ? data.rating_average : null,
    reviewsTotal: data.paging?.total ?? (brutas.length || null),
    ratingLevels: niveis
      ? {
          uma: contar(niveis.one_star),
          duas: contar(niveis.two_star),
          tres: contar(niveis.three_star),
          quatro: contar(niveis.four_star),
          cinco: contar(niveis.five_star),
        }
      : null,
    opinioes,
  };
}

function skuDosAtributos(attributes?: MLAttribute[]): string | null {
  const atributo = attributes?.find((item) => item.id === "SELLER_SKU");
  return atributo?.value_name?.trim()
    || atributo?.values?.find((item) => item.name?.trim())?.name?.trim()
    || null;
}

export function normalizarCatalogoMercadoLivre(items: MLItemDetail[], ratings: MLRatings = new Map()): MLAnuncioCatalogo[] {
  return items.flatMap<MLAnuncioCatalogo>((item): MLAnuncioCatalogo[] => {
    const skuItem = skuDosAtributos(item.attributes) || item.seller_custom_field?.trim() || null;
    const rating = ratings.get(item.id) ?? SEM_AVALIACAO;
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

/** Fica pura de propósito (sem I/O) — quem busca o endereço é o chamador
 *  (buscarPedidos/listarPedidosHistoricos, via buscarEnderecoEntrega), que
 *  passa o resultado já resolvido aqui. Isso mantém a função testável sem
 *  mock de rede (webhook-mercadolivre.test.ts chama sem o segundo argumento)
 *  e deixa explícito que buscar o endereço é opcional — uma falha nele nunca
 *  pode impedir o pedido em si de ser sincronizado. */
export function normalizarPedidoMercadoLivre(
  order: MLOrderDetail,
  endereco?: MLReceiverAddress | null,
): PedidoNormalizado {
  const clienteEndereco: EnderecoEntregaNormalizado | undefined = endereco ? {
    nomeDestinatario: endereco.receiver_name || undefined,
    rua: endereco.street_name || undefined,
    numero: endereco.street_number || undefined,
    complemento: endereco.comment || undefined,
    bairro: endereco.neighborhood?.name || undefined,
    cidade: endereco.city?.name || undefined,
    estado: endereco.state?.name || undefined,
    cep: endereco.zip_code || undefined,
    latitude: endereco.latitude,
    longitude: endereco.longitude,
  } : undefined;

  return {
    providerOrderId: String(order.id),
    canal: "mercadolivre",
    clienteExternalId: String(order.buyer.id),
    // O ML não dá o nome real do comprador — só o apelido mascarado
    // (nickname, tipo "DR20241011101108"). O nome digitado no endereço de
    // entrega é mais legível e, quando existe, é preferido; sem endereço
    // resolvido, cai pro apelido mesmo.
    clienteNome: endereco?.receiver_name || order.buyer.nickname,
    clienteEmail: order.buyer.email,
    clienteEndereco,
    status: order.status,
    total: String(order.total_amount),
    frete: order.shipping?.cost === undefined ? undefined : String(order.shipping.cost),
    itens: order.order_items.map((item) => ({
      skuExterno: item.item.seller_sku ?? "",
      quantidade: item.quantity,
      precoUnitario: String(item.unit_price),
      taxaMarketplace: typeof item.sale_fee === "number" ? String(item.sale_fee) : undefined,
    })),
    criadoEm: new Date(order.date_created),
  };
}

/** Teto de chamadas simultâneas à API do Mercado Livre.
 *
 *  Vários pontos deste provider fazem fan-out com Promise.all sobre a página
 *  inteira de pedidos (até 50 packs → 50 requisições disparadas no mesmo tick).
 *  Rajadas assim são o que o Mercado Livre pune com 429 e, se insistirem, com
 *  bloqueio temporário da aplicação. O semáforo mantém a vazão alta sem a
 *  rajada: as chamadas continuam concorrentes, só que em janelas de 6. */
const MAX_CHAMADAS_SIMULTANEAS = 6;

let emVoo = 0;
const fila: Array<() => void> = [];

async function comLimiteDeConcorrencia<T>(tarefa: () => Promise<T>): Promise<T> {
  if (emVoo >= MAX_CHAMADAS_SIMULTANEAS) {
    await new Promise<void>((resolve) => fila.push(resolve));
  }
  emVoo += 1;
  try {
    return await tarefa();
  } finally {
    emVoo -= 1;
    fila.shift()?.();
  }
}

const espera = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** O Mercado Livre manda o tempo de espera no header Retry-After em 429.
 *  Ignorar isso e repetir na hora é o caminho mais curto para o bloqueio. */
function atrasoDaResposta(res: Response, tentativa: number): number {
  const retryAfter = Number(res.headers.get("retry-after"));
  if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.min(retryAfter * 1000, 10_000);
  return Math.min(500 * 2 ** tentativa, 4_000);
}

export class MercadoLivreProvider implements ChannelProvider {
  private readonly baseUrl = "https://api.mercadolibre.com";

  constructor(private readonly creds: MLCredentials) {}

  private async get<T>(path: string): Promise<T> {
    return comLimiteDeConcorrencia(async () => {
      // 429 e 5xx são transitórios: recuar e repetir preserva a saúde da
      // integração. Os demais status são erro de fato e sobem na hora, sem
      // gastar tentativa à toa.
      for (let tentativa = 0; ; tentativa += 1) {
        const res = await fetch(`${this.baseUrl}${path}`, {
          headers: { Authorization: `Bearer ${this.creds.accessToken}` },
          signal: AbortSignal.timeout(10_000),
        });
        if (res.ok) return res.json() as Promise<T>;

        const transitorio = res.status === 429 || res.status >= 500;
        if (!transitorio || tentativa >= 2) {
          throw new Error(`Mercado Livre HTTP ${res.status} em ${path}`);
        }
        await espera(atrasoDaResposta(res, tentativa));
      }
    });
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

  /** Nome completo e endereço do destinatário não vêm no /orders/search — só
   *  o id do envio. Esta segunda chamada busca o endereço de fato. Falha
   *  aqui é enriquecimento perdido, não motivo pra descartar o pedido: por
   *  isso engole o erro e devolve null em vez de propagar. */
  private async buscarEnderecoEntrega(shippingId: number): Promise<MLReceiverAddress | null> {
    try {
      const envio = await this.get<{ receiver_address?: MLReceiverAddress }>(`/shipments/${shippingId}`);
      return envio.receiver_address ?? null;
    } catch {
      return null;
    }
  }

  async buscarPedidos(desde: Date): Promise<PedidoNormalizado[]> {
    const me = await this.get<{ id: string }>("/users/me");
    const data = await this.get<{
      results?: MLOrderDetail[];
    }>(`/orders/search?seller=${me.id}&order.date_created.from=${encodeURIComponent(desde.toISOString())}&limit=50`);

    return Promise.all((data.results ?? []).map(async (order) => {
      const endereco = order.shipping?.id ? await this.buscarEnderecoEntrega(order.shipping.id) : null;
      return normalizarPedidoMercadoLivre(order, endereco);
    }));
  }

  /** Busca ativa das mensagens pós-venda (chat dentro de um pedido já
   *  fechado) dos pedidos recentes do vendedor. Complementa o webhook do
   *  tópico "messages": o webhook só reage a eventos novos a partir do
   *  momento em que está no ar, então pedidos/mensagens anteriores a isso
   *  nunca chegariam à aba Conversas sem essa busca. Falha por pedido não
   *  derruba a sincronização inteira — só aquele pedido fica sem histórico. */
  async buscarMensagensPosVendaRecentes(desde: Date): Promise<MLMensagemPosVenda[]> {
    const me = await this.get<{ id: string }>("/users/me");
    const sellerId = Number(me.id);
    const orders = await this.get<{ results?: MLOrderDetail[] }>(
      `/orders/search?seller=${me.id}&order.date_created.from=${encodeURIComponent(desde.toISOString())}&limit=50`,
    );
    const results = orders.results ?? [];

    const packsUnicos = new Map<string, { orderId: string; shippingId?: number; nickname: string | null; produtos: string[] }>();
    for (const order of results) {
      const packId = String(order.pack_id ?? order.id);
      if (!packsUnicos.has(packId)) {
        const produtos = order.order_items.map((item) => item.item.title).filter((t): t is string => !!t);
        packsUnicos.set(packId, { orderId: String(order.id), shippingId: order.shipping?.id, nickname: order.buyer?.nickname ?? null, produtos });
      }
    }
    console.log(`[ml-provider] ${results.length} pedido(s) desde ${desde.toISOString()}, ${packsUnicos.size} pack(s) único(s)`);

    // Mesmo endereço de entrega usado em buscarPedidos: dá o nome real do
    // destinatário, bem melhor que o apelido do ML que sobra quando ainda
    // não existe cliente sincronizado pra esse comprador.
    const buyerNomes = await Promise.all([...packsUnicos.entries()].map(async ([packId, { shippingId, nickname }]) => {
      const endereco = shippingId ? await this.buscarEnderecoEntrega(shippingId) : null;
      const nome = endereco?.receiver_name || (nickname ? `${nickname} (apelido)` : null);
      return [packId, nome] as const;
    }));
    const buyerNomePorPack = new Map(buyerNomes);

    const porPack = await Promise.all([...packsUnicos.entries()].map(async ([packId, { orderId, produtos }]) => {
      const buyerNome = buyerNomePorPack.get(packId) ?? null;
      try {
        const mensagens = await this.get<MLPackMessageRaw[] | { messages?: MLPackMessageRaw[] }>(
          `/messages/packs/${encodeURIComponent(packId)}/sellers/${sellerId}?tag=post_sale&limit=50`,
        );
        const lista = Array.isArray(mensagens) ? mensagens : (mensagens.messages ?? []);
        return lista
          .filter((m) => (m.text ?? m.subject))
          .map((m): MLMensagemPosVenda => ({
            packId,
            orderId,
            providerMessageId: String(m.message_id ?? m.id ?? ""),
            texto: (m.text ?? m.subject ?? "").trim(),
            remetenteId: m.from?.user_id ?? null,
            remetenteNome: m.from?.user_id === sellerId ? null : buyerNome,
            produtos,
            destinatarioId: m.to?.user_id ?? null,
            criadaEm: m.message_date?.received ?? m.message_date?.available ?? m.message_date?.created ?? null,
            deVendedor: m.from?.user_id === sellerId,
          }))
          .filter((m) => m.providerMessageId && m.texto);
      } catch {
        return [];
      }
    }));

    return porPack.flat();
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
      // Sem busca de endereço aqui de propósito: importação histórica processa
      // volumes grandes de uma vez, e não vale multiplicar por uma chamada
      // extra de API por pedido para um dado que é enriquecimento, não o
      // pedido em si. Fica só no fluxo de sincronização em tempo real acima.
      pedidos: (data.results ?? []).map((order) => normalizarPedidoMercadoLivre(order)),
      total: data.paging?.total ?? data.results?.length ?? 0,
      offset: data.paging?.offset ?? offset,
      limit: data.paging?.limit ?? limit,
    };
  }

  // Opinião de produto é read-only na API do ML — não há endpoint pra solicitar
  // ou responder avaliação, só consultar o que já existe (GET /reviews/item).
  // A mesma resposta traz a média, a distribuição por estrela e os textos das
  // opiniões, então lê-los é de graça. Falha por item não derruba o catálogo
  // inteiro: fica sem nota, o resto segue normal.
  private async buscarAvaliacoes(itemIds: string[]): Promise<MLRatings> {
    const unicos = [...new Set(itemIds)];
    const resultados = await Promise.all(unicos.map(async (id) => {
      try {
        const data = await this.get<MLReviewsResponse>(`/reviews/item/${encodeURIComponent(id)}`);
        return [id, normalizarAvaliacoesItem(data)] as const;
      } catch {
        return [id, SEM_AVALIACAO] as const;
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

  // Reclamações (claims) do pós-venda.
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

  async listarMensagensReclamacao(claimId: string): Promise<MLReclamacaoMensagem[]> {
    const claimIdNumero = Number(claimId);
    if (!Number.isSafeInteger(claimIdNumero) || claimIdNumero <= 0) {
      throw new Error("ID de reclamação do Mercado Livre inválido.");
    }
    const mensagens = await this.get<MLClaimMessageRaw[]>(
      `/post-purchase/v1/claims/${claimIdNumero}/messages`,
    );
    return (Array.isArray(mensagens) ? mensagens : [])
      // Mensagens moderadas/rejeitadas não vêm com texto utilizável — a API já
      // filtra a maioria, mas alguns registros antigos chegam com status vazio.
      .filter((mensagem) => (mensagem.status ?? "available") !== "rejected" && mensagem.message)
      .map((mensagem) => ({
        remetente: mensagem.sender_role ?? "desconhecido",
        destinatario: mensagem.receiver_role ?? "desconhecido",
        texto: mensagem.message ?? "",
        criadaEm: mensagem.date_created ?? null,
      }))
      .sort((a, b) => (a.criadaEm ?? "").localeCompare(b.criadaEm ?? ""));
  }

  /** O vendedor é sempre "respondent". destinatario vem da etapa da reclamação:
   *  "claim" → complainant, "dispute" (mediação) → mediator (ver tabela
   *  available_actions da documentação oficial). */
  async responderReclamacao(claimId: string, mensagem: string, destinatario: MLReclamacaoDestinatario): Promise<void> {
    const claimIdNumero = Number(claimId);
    if (!Number.isSafeInteger(claimIdNumero) || claimIdNumero <= 0) {
      throw new Error("ID de reclamação do Mercado Livre inválido.");
    }
    const res = await fetch(`${this.baseUrl}/post-purchase/v1/claims/${claimIdNumero}/actions/send-message`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.creds.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ receiver_role: destinatario, message: mensagem, attachments: [] }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      // A resposta de sucesso é "201 created" sem corpo JSON útil — só falha vira texto.
      const detail = (await res.text()).replace(/[\r\n]+/g, " ").slice(0, 300);
      throw new Error(`Mercado Livre HTTP ${res.status} ao responder reclamação: ${detail}`);
    }
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
    // Anúncio com variações: o Mercado Livre sempre retorna available_quantity=0
    // no nível do item — o saldo real só existe dentro de cada variação. Sem um
    // variationId mapeado não dá pra saber qual variação ler, então tratamos como
    // erro de configuração em vez de reportar 0 como se fosse saldo real.
    if (!variationId && item.variations && item.variations.length > 0) {
      throw new Error(
        `Anúncio ${referencia.listingId} tem variações no Mercado Livre, mas o mapeamento do produto não define a variação (externalWarehouseId). Configure a variação correta antes de reconciliar o saldo.`,
      );
    }
    const saldo = variationId
      ? item.variations?.find((variation) => variation.id === variationId)?.available_quantity
      : item.available_quantity;
    if (!Number.isInteger(saldo) || (saldo ?? -1) < 0) {
      throw new Error(`Mercado Livre retornou saldo inválido para anúncio ${referencia.listingId}.`);
    }
    return saldo as number;
  }

  /** Reputação do vendedor. Não custa chamada nova em relação ao que já
   *  fazemos: `/users/me` (que buscarPedidos, listarAnunciosAtivos e saude já
   *  chamam) devolve o bloco `seller_reputation` inteiro na mesma resposta —
   *  até hoje a gente lia só o `id` e jogava o resto fora. */
  async obterReputacao(): Promise<MLReputacao> {
    const me = await this.get<{
      id: number | string;
      nickname?: string;
      points?: number;
      seller_reputation?: MLSellerReputationRaw;
    }>("/users/me");
    const reputacao = me.seller_reputation;
    const metricas = reputacao?.metrics;
    return {
      sellerId: String(me.id),
      nickname: me.nickname ?? null,
      pontos: typeof me.points === "number" ? me.points : null,
      nivelId: reputacao?.level_id ?? null,
      statusMercadoLider: reputacao?.power_seller_status ?? null,
      vendasConcluidas: metricas?.sales?.completed ?? reputacao?.transactions?.completed ?? null,
      // As taxas do ML vêm em fração (0.012 = 1,2%). Convertemos aqui, uma vez
      // só, para o resto do sistema nunca precisar lembrar disso.
      taxaReclamacao: fracaoParaPercentual(metricas?.claims?.rate),
      taxaCancelamento: fracaoParaPercentual(metricas?.cancellations?.rate),
      taxaAtrasoEnvio: fracaoParaPercentual(metricas?.delayed_handling_time?.rate),
      reclamacoesPeriodo: metricas?.claims?.value ?? null,
      cancelamentosPeriodo: metricas?.cancellations?.value ?? null,
      atrasosPeriodo: metricas?.delayed_handling_time?.value ?? null,
      periodoMetricas: metricas?.claims?.period ?? metricas?.sales?.period ?? null,
      avaliacaoPositiva: fracaoParaPercentual(reputacao?.transactions?.ratings?.positive),
      avaliacaoNeutra: fracaoParaPercentual(reputacao?.transactions?.ratings?.neutral),
      avaliacaoNegativa: fracaoParaPercentual(reputacao?.transactions?.ratings?.negative),
    };
  }

  async obterVisitasItens(itemIds: string[], dataInicio: string, dataFim: string): Promise<MLVisitasItem[]> {
    if (itemIds.length === 0) return [];
    // Apesar do parâmetro se chamar `ids`, a API de visitas do marketplace
    // aceita no máximo um item por requisição (validado ao vivo em MLB).
    const respostas = await Promise.all(itemIds.map(async (itemId) => {
      const params = new URLSearchParams({ ids: itemId, date_from: dataInicio, date_to: dataFim });
      return this.get<Array<{ item_id?: string; total_visits?: number }>>(`/items/visits?${params.toString()}`);
    }));
    return respostas.flat()
      .filter((item): item is { item_id: string; total_visits?: number } => Boolean(item.item_id))
      .map((item) => ({ itemId: item.item_id, total: item.total_visits ?? 0 }));
  }

  async obterPerformanceItem(itemId: string): Promise<MLPerformanceItem> {
    const resposta = await this.get<{
      entity_id?: string;
      score?: number;
      level_wording?: string;
      level?: string;
      calculated_at?: string;
      buckets?: Array<{ variables?: Array<{ status?: string; title?: string; rules?: Array<{ status?: string; wordings?: { title?: string } }> }> }>;
    }>(`/item/${itemId}/performance`);
    const pendencias = (resposta.buckets ?? []).flatMap((bucket) => bucket.variables ?? [])
      .flatMap((variavel) => {
        const regras = (variavel.rules ?? []).filter((regra) => regra.status === "PENDING").map((regra) => regra.wordings?.title).filter(Boolean) as string[];
        return regras.length > 0 ? regras : variavel.status === "PENDING" && variavel.title ? [variavel.title] : [];
      });
    return {
      itemId,
      entityId: resposta.entity_id ?? itemId,
      score: resposta.score ?? 0,
      nivel: resposta.level_wording ?? resposta.level ?? null,
      calculadoEm: resposta.calculated_at ?? null,
      pendencias: [...new Set(pendencias)].slice(0, 3),
    };
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
