import crypto from "crypto";
import { proximoCursorSeguro } from "../domain/paginacao";
import type { ChannelProvider, EstoqueCanalRef, PedidoNormalizado, SaudeConector, OpcoesBuscaPedidos } from "../domain/ports";
import { brandEnvSuffix, type BrandSlug } from "@/shared/config/brands";
import { shopeeFetch } from "@/shared/lib/shopee-proxy";
import { createClient } from "@supabase/supabase-js";
import { mapearStatusPedido } from "../domain/order-status";
import { selecionarSkuTikTok } from "../domain/modelo-estoque-tiktok";
import { statusPedidoFaturavel } from "@/modules/vendas/domain/status-faturamento";

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
  /* `payment` do detalhe (/order/202309/orders) tem os campos que reconstroem
     o bruto — ver ESPEC_CANAL.tiktokshop em auditoria-financeira.ts, onde a
     fórmula foi validada contra pedido real: total_amount = soma dos
     original_price dos itens + shipping_fee + handling_fee − platform_discount
     − seller_discount. `handling_fee` nem sempre vem (pedido sem juro de
     parcelamento simplesmente omite o campo). */
  payment?: {
    total_amount?: string;
    shipping_fee?: string;
    handling_fee?: string;
    platform_discount?: string;
    seller_discount?: string;
  };
  payment_info?: { total_amount?: string };
  recipient_address?: { name?: string; phone_number?: string };
  /* `buyer_uid` nunca aparece no payload real — o identificador do comprador
     é `user_id`. Manter os dois campos aqui (em vez de só trocar o nome) para
     não quebrar silenciosamente se o TikTok um dia voltar a mandar buyer_uid. */
  buyer_uid?: string;
  user_id?: string;
  buyer_email?: string;
  create_time: number;
  paid_time?: number;
  cancel_reason?: string;
  update_time?: number;
  /* Não existe `quantity`: o TikTok repete a linha inteira uma vez por
     unidade, com o mesmo sku_id e o mesmo preço unitário — confirmado com
     pedidos reais das três marcas (ex.: pedido 585872424607319127 da WUWU,
     duas linhas idênticas de "730-F/BL"). `normalizarPedidos` agrupa por
     sku_id e conta as repetições. */
  line_items?: Array<{
    seller_sku: string;
    sku_id?: string;
    sale_price: string;
    original_price?: string;
    product_id?: string;
    product_name?: string;
  }>;
};

/** Mesmo formato mínimo que `MLAnuncioCatalogo`/`ShopeeAnuncioCatalogo`
 *  exigem do importador de Estoque — ver o comentário em
 *  `listarCatalogoAtivo` para o que cada campo carrega no caso do TikTok. */
export interface TikTokAnuncioCatalogo {
  listingId: string;
  variationId: string | null;
  externalSku: string | null;
  title: string;
  availableQuantity: number;
  price: string;
}

/** Uma linha do extrato financeiro. São mais de cinquenta campos no payload
 *  real (comissão de afiliado, imposto retido, frete reembolsado, cada um com
 *  sua variante de estorno); aqui ficam só os quatro que o CRM usa mais o
 *  `order_id` que amarra a linha ao pedido. Os valores chegam como string e
 *  as retenções vêm negativas ("-8.18"). */
export interface TikTokTransacaoExtrato {
  order_id?: string;
  settlement_amount?: string;
  revenue_amount?: string;
  fee_amount?: string;
  shipping_cost_amount?: string;
  /* As retenções que são COMISSÃO, separadas do frete. `fee_amount` mistura
     as duas: no agregado de 40 dias da WUWU (03/09/2026) ele soma −1.180,64,
     dos quais −326,96 são comissão de plataforma e o resto é frete real menos
     o subsídio que a plataforma devolve. Escrever `fee_amount` na linha
     "Taxa do canal de venda" diria que o canal cobrou o frete. */
  platform_commission_amount?: string;
  referral_fee_amount?: string;
  transaction_fee_amount?: string;
  /* Declarados para deixar explícito que ficam FORA da comissão: é frete que a
     loja paga à transportadora, não retenção do canal. */
  actual_shipping_fee_amount?: string;
  fbm_shipping_cost_amount?: string;
  currency?: string;
  type?: string;
}

/** O repasse de um pedido, já somado entre as transações do período. */
export interface RepasseTikTok {
  orderId: string;
  /** O que a loja recebe de fato — é este que vira `pedido.valor_liquido`. */
  liquido: number;
  receita: number;
  /** Negativo: é retenção. */
  taxas: number;
  /** Só a parte de comissão das retenções, POSITIVA — é o que a tela do
   *  pedido chama de "Taxa do canal de venda", no mesmo sinal que o
   *  `sale_fee` do Mercado Livre e o rateio do escrow da Shopee já gravam. */
  comissao: number;
  frete: number;
  moeda: string;
  transacoes: number;
}

/** String de dinheiro do TikTok para centavos inteiros. Campo ausente é zero
 *  — o payload omite o que não se aplica ao pedido —, mas texto que não vira
 *  número não pode virar zero calado: seria uma retenção sumindo da conta. */
function centavos(valor: string | undefined): number {
  if (valor === undefined || valor === "") return 0;
  const numero = Number(valor);
  if (!Number.isFinite(numero)) throw new Error(`TikTok: valor financeiro inválido no extrato: ${valor}`);
  return Math.round(numero * 100);
}

/* ── Vazio do TikTok é string vazia, não campo ausente ───────────────────
 *
 *  O canal preenche `""` em vez de omitir o campo — em pedido cancelado antes
 *  do pagamento, que nunca chega a ter endereço de entrega, isso vale para
 *  nome, telefone e às vezes e-mail. Como `??` só cai no padrão quando o valor
 *  é `undefined`, a string vazia atravessava a normalização inteira e só
 *  quebrava no banco: `cliente` tem índice único por telefone e por e-mail na
 *  organização (uq_cliente_org_telefone_active / _email_active), então TODO
 *  cliente sem telefone colidia no mesmo `""`. Foram 183 pedidos recusados com
 *  `cliente_duplicado` numa importação real de 03/09/2026 — e nenhum deles era
 *  duplicata de verdade. */
function textoOuIndefinido(valor: string | undefined): string | undefined {
  const limpo = valor?.trim();
  return limpo ? limpo : undefined;
}

/** Telefone só serve se der para ligar. Descarta vazio e descarta a máscara
 *  do TikTok ("(+55)119******45"), que além de inútil colide entre
 *  compradores distintos — ver o comentário em `normalizarPedidos`. */
function telefoneUtilizavel(valor: string | undefined): string | undefined {
  const limpo = textoOuIndefinido(valor);
  return limpo?.includes("*") ? undefined : limpo;
}

/** Soma as transações de extrato por pedido.
 *
 *  Separada do provider porque é a regra que define o dinheiro gravado — soma
 *  em centavos (somar "-8.18" com "26.72" em ponto flutuante erra por
 *  arredondamento), soma TODAS as transações do mesmo pedido (venda num
 *  extrato, devolução em outro) e descarta o pedido que ainda não tem extrato,
 *  que o TikTok devolve zerado em vez de omitir. */
export function agruparRepasses(transacoes: TikTokTransacaoExtrato[]): RepasseTikTok[] {
  const acumulado = new Map<string, { liquido: number; receita: number; taxas: number; frete: number; comissao: number; moeda: string; transacoes: number }>();
  for (const transacao of transacoes) {
    const orderId = transacao.order_id;
    if (!orderId) continue;
    const atual = acumulado.get(orderId)
      ?? { liquido: 0, receita: 0, taxas: 0, frete: 0, comissao: 0, moeda: transacao.currency ?? "BRL", transacoes: 0 };
    atual.liquido += centavos(transacao.settlement_amount);
    atual.receita += centavos(transacao.revenue_amount);
    atual.taxas += centavos(transacao.fee_amount);
    atual.frete += centavos(transacao.shipping_cost_amount);
    // Invertido: a comissão chega negativa ("-2.69") e a coluna do CRM é
    // positiva. Devolução gera transação de sinal contrário e a soma cai
    // sozinha — por isso somar antes de inverter, e não o contrário.
    atual.comissao -= centavos(transacao.platform_commission_amount)
      + centavos(transacao.referral_fee_amount)
      + centavos(transacao.transaction_fee_amount);
    atual.transacoes += 1;
    acumulado.set(orderId, atual);
  }
  return [...acumulado.entries()]
    .filter(([, valores]) => valores.liquido !== 0 || valores.receita !== 0)
    .map(([orderId, valores]) => ({
      orderId,
      liquido: valores.liquido / 100,
      receita: valores.receita / 100,
      taxas: valores.taxas / 100,
      frete: valores.frete / 100,
      // Comissão negativa não existe: seria estorno maior que a cobrança, e
      // gravar isso viraria "o canal te pagou taxa". Piso em zero.
      comissao: Math.max(valores.comissao, 0) / 100,
      moeda: valores.moeda,
      transacoes: valores.transacoes,
    }));
}

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
    options: { method?: "GET" | "POST"; query?: Record<string, string>; body?: unknown; timeoutMs?: number; semShopCipher?: boolean } = {},
  ): Promise<T> {
    /* `shop_cipher` identifica a loja e vai em quase tudo — mas há endpoints
       que operam sobre a AUTORIZAÇÃO, não sobre uma loja, e o TikTok recusa a
       chamada quando o parâmetro aparece: "The 'shop_cipher' query parameter
       is not required for this request". É o caso de /seller/202309/shops e de
       /authorization/202309/shops. Enquanto o health check mandava o cipher,
       ele falhava sempre — e a conta TikTok aparecia como "erro" em
       Configurações mesmo com a integração perfeita. */
    const params: Record<string, string> = {
      app_key: this.creds.appKey,
      timestamp: String(Math.floor(Date.now() / 1000)),
      ...(options.semShopCipher ? {} : { shop_cipher: this.creds.shopCipher }),
      ...options.query,
    };
    params.sign = this.assinar(path, params, options.body);
    // Mesmo proxy de IP fixo da Shopee (shopeeFetch): o IP cadastrado na
    // "Lista de permissões de IP" do app TikTok no Partner Center é o mesmo
    // IP do proxy Webshare já usado pela Shopee — sem ele, a chamada sai pelo
    // IP efêmero da Vercel e o TikTok recusa.
    const res = await shopeeFetch(`${this.baseUrl}${path}?${new URLSearchParams(params)}`, {
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

  /* ── Uma janela por step ────────────────────────────────────────────────
   *
   *  Sem o par `janelasDePedidos`/`buscarPedidosDaJanela`, o A31 varre os 90
   *  dias inteiros dentro de UM `step.run`: o step estoura o `maxDuration`, o
   *  Inngest reexecuta do zero e a conta fica presa em `em_andamento` para
   *  sempre, refazendo as mesmas chamadas e queimando a cota do proxy. Foi o
   *  que já aconteceu com a Shopee em 25/08/2026, e a WUWU do TikTok tem o
   *  mesmo perfil de volume (1418 pedidos em 90 dias).
   *
   *  Sete dias por janela: o A31 ainda subdivide em 24h por step
   *  (`fatiarJanelasPedidos`), então este valor é só o teto de quem chama
   *  `buscarPedidos` direto, fora de job. */
  private static readonly JANELA_MAX_PEDIDOS_MS = 7 * 24 * 60 * 60 * 1000;

  // `Date.now()`, não `new Date()`: o relógio é mockado nos testes de
  // contrato, e `new Date()` ignora o spy — mesma razão da Shopee.
  janelasDePedidos(desde: Date, ate: Date = new Date(Date.now())): Array<{ inicioMs: number; fimMs: number }> {
    const fim = ate.getTime();
    const janelas: Array<{ inicioMs: number; fimMs: number }> = [];
    let inicioJanela = desde.getTime();
    while (inicioJanela < fim) {
      const fimJanela = Math.min(inicioJanela + TikTokShopProvider.JANELA_MAX_PEDIDOS_MS, fim);
      janelas.push({ inicioMs: inicioJanela, fimMs: fimJanela });
      inicioJanela = fimJanela;
    }
    return janelas;
  }

  /** Só os identificadores e o status, direto da listagem — sem pagar o
   *  detalhe. É o que permite a `filtrarPendentes` decidir, olhando o banco,
   *  o que ainda vale reler. */
  private async listarCandidatosDaJanela(
    inicioMs: number,
    fimMs: number,
    campoData: OpcoesBuscaPedidos["campoData"],
  ): Promise<Array<{ providerOrderId: string; statusExterno: string }>> {
    const candidatos = new Map<string, string>();
    const cursores = new Set<string>();
    const campo = campoData === "atualizacao" ? "update_time" : "create_time";
    let cursor = "";
    for (let pagina = 0; pagina < 200; pagina++) {
      const data = await this.request<{ orders?: TikTokOrder[]; next_page_token?: string; total_count?: number }>("/order/202309/orders/search", {
        method: "POST",
        query: { page_size: "50", sort_order: "ASC", sort_field: campo, ...(cursor ? { page_token: cursor } : {}) },
        body: { [`${campo}_ge`]: Math.floor(inicioMs / 1000), [`${campo}_lt`]: Math.floor(fimMs / 1000) },
      });
      /* Janela sem nenhum pedido não traz a chave `orders` — o TikTok devolve
         só `{ next_page_token: "", total_count: 0 }` (confirmado ao vivo em
         03/09/2026 contra uma janela de 2020). Exigir o array aqui derrubava a
         coleta inteira por causa de uma semana parada, o que é comum na KARZI
         e na ARMARINHOS LIMA. Ausente é vazio; presente e não-array é que é
         resposta malformada. */
      if (data.orders !== undefined && !Array.isArray(data.orders)) {
        throw new Error("TikTok: listagem sem array de pedidos.");
      }
      for (const pedido of data.orders ?? []) candidatos.set(pedido.id, pedido.status);
      const proximo = proximoCursorSeguro(cursor, data.next_page_token, Boolean(data.next_page_token), cursores, "TikTok pedidos");
      if (proximo === null) {
        if (data.total_count != null && candidatos.size < data.total_count) {
          throw new Error("TikTok: pedidos incompletos sem continuação.");
        }
        return [...candidatos].map(([providerOrderId, statusExterno]) => ({ providerOrderId, statusExterno }));
      }
      cursor = proximo;
    }
    throw new Error("TikTok: coleta incompleta após 200 páginas.");
  }

  /** Uma janela só — ver `janelasDePedidos`. */
  async buscarPedidosDaJanela(
    inicioMs: number,
    fimMs: number,
    opcoes: OpcoesBuscaPedidos = {},
  ): Promise<PedidoNormalizado[]> {
    const candidatos = await this.listarCandidatosDaJanela(inicioMs, fimMs, opcoes.campoData);
    if (candidatos.length === 0) return [];

    /* A listagem já foi paga; o caro é o detalhe. A janela de contingência
       revisita as mesmas horas várias vezes por dia — sem este filtro, todo
       pedido já gravado é relido por inteiro a cada passagem, só para
       reescrever o que já estava lá. Sem o filtro, lê tudo (comportamento
       antigo). */
    const ids = opcoes.filtrarPendentes
      ? await opcoes.filtrarPendentes(candidatos)
      : candidatos.map((item) => item.providerOrderId);
    if (ids.length === 0) return [];

    // A listagem não traz itens nem pagamento: o detalhe é obrigatório.
    return this.buscarPedidosPorIds(ids);
  }

  async buscarPedidos(desde: Date, opcoes: OpcoesBuscaPedidos = {}): Promise<PedidoNormalizado[]> {
    const pedidos: PedidoNormalizado[] = [];
    for (const { inicioMs, fimMs } of this.janelasDePedidos(desde, opcoes.ate)) {
      pedidos.push(...await this.buscarPedidosDaJanela(inicioMs, fimMs, opcoes));
    }
    return [...new Map(pedidos.map((p) => [p.providerOrderId, p])).values()];
  }

  async resumirFaturamentoOficial(desde: Date, ate: Date): Promise<{
    faturamento: number;
    pedidosValidos: number;
    canceladosValor: number;
    canceladosQtd: number;
    totalBruto: number;
    totalPedidos: number;
  }> {
    const pedidos = await this.buscarPedidos(desde, { ate });
    let faturamentoCentavos = 0;
    let canceladosCentavos = 0;
    let pedidosValidos = 0;
    let canceladosQtd = 0;

    for (const pedido of pedidos) {
      const total = Number(pedido.total);
      if (!pedido.total.trim() || !Number.isFinite(total)) {
        throw new Error(`TikTok Shop: pedido ${pedido.providerOrderId} sem total válido.`);
      }
      const centavos = Math.round(total * 100);
      const status = mapearStatusPedido(pedido.status);
      if (status === "cancelado" || status === "devolvido") {
        canceladosCentavos += centavos;
        canceladosQtd += 1;
      } else if (statusPedidoFaturavel(status)) {
        faturamentoCentavos += centavos;
        pedidosValidos += 1;
      }
    }

    return {
      faturamento: faturamentoCentavos / 100,
      pedidosValidos,
      canceladosValor: canceladosCentavos / 100,
      canceladosQtd,
      totalBruto: (faturamentoCentavos + canceladosCentavos) / 100,
      totalPedidos: pedidos.length,
    };
  }

  async buscarPedidosPorIds(ids: string[]): Promise<PedidoNormalizado[]> {
    const resultados: PedidoNormalizado[] = [];
    const unicos = [...new Set(ids)];
    for (let i = 0; i < unicos.length; i += 50) {
      const lote = unicos.slice(i, i + 50);
      const data = await this.request<{ orders?: TikTokOrder[] }>("/order/202309/orders", {
        query: { ids: lote.join(",") },
      });
      if (!Array.isArray(data.orders) || lote.some((id) => !data.orders!.some((o) => o.id === id))) {
        throw new Error("TikTok: detalhe de pedidos incompleto; repetir a coleta.");
      }
      resultados.push(...this.normalizarPedidos(data.orders.filter((o) => lote.includes(o.id))));
    }
    return resultados;
  }

  /** Agrupa as linhas repetidas por unidade em um item com `quantidade`. Ver
   *  o comentário no tipo `line_items` — o TikTok não manda `quantity`, manda
   *  uma linha por unidade com o mesmo `sku_id` e o mesmo preço unitário. */
  private agruparItens(order: TikTokOrder): PedidoNormalizado["itens"] {
    const grupos = new Map<string, { linha: NonNullable<TikTokOrder["line_items"]>[number]; quantidade: number }>();
    for (const linha of order.line_items ?? []) {
      const chave = linha.sku_id ?? linha.seller_sku;
      const existente = grupos.get(chave);
      if (existente) existente.quantidade += 1;
      else grupos.set(chave, { linha, quantidade: 1 });
    }
    return [...grupos.values()].map(({ linha, quantidade }) => ({
      skuExterno: linha.seller_sku,
      quantidade,
      // `original_price` (preço-cheio por unidade, ANTES do desconto), não
      // `sale_price` (já líquido do desconto) — é o que faz `somaComponentes`
      // em ESPEC_CANAL.tiktokshop reconstruir `total_amount` batendo com o
      // desconto contado à parte, sem descontar duas vezes.
      precoUnitario: linha.original_price ?? linha.sale_price,
      listingId: linha.product_id,
      variationId: linha.sku_id ?? null,
      titulo: linha.product_name,
    }));
  }

  private normalizarPedidos(orders: TikTokOrder[]): PedidoNormalizado[] {
    return orders.map((order) => {
      const pg = order.payment;
      // Soma em vez de campo único: platform_discount e seller_discount são
      // reduções distintas do mesmo total, e o contrato só tem uma coluna de
      // desconto. shipping_fee_platform_discount NÃO entra aqui — já está
      // embutido em `frete` (shipping_fee já é o valor líquido pago pelo
      // comprador), somar de novo contaria o mesmo desconto duas vezes.
      const desconto = Number(pg?.platform_discount ?? 0) + Number(pg?.seller_discount ?? 0);
      return {
        providerOrderId: order.id,
        canal: "tiktokshop",
        clienteExternalId: order.user_id ?? order.buyer_uid ?? order.buyer_email ?? order.id,
        // `??` não bastava: quando o TikTok não tem o nome do destinatário ele
        // manda `name: ""`, string vazia — que passa pelo `??` e só é barrada
        // lá na frente, pelo schema da ingestão ("clienteNome: expected string
        // to have >=1 characters"). Foram 235 dos 1457 pedidos das três marcas
        // recusados assim numa importação real em 03/09/2026, a maioria
        // cancelados (pedido cancelado antes do pagamento não chega a ter
        // endereço de entrega preenchido).
        clienteNome: textoOuIndefinido(order.recipient_address?.name) ?? "Cliente TikTok Shop",
        clienteEmail: textoOuIndefinido(order.buyer_email),
        /* Telefone mascarado NÃO é telefone. O TikTok entrega
           "(+55)119******45": não dá para ligar, e o pior — a máscara colide.
           Em 1418 pedidos reais da WUWU (90 dias, 03/09/2026), 182 telefones
           mascarados eram compartilhados por compradores DIFERENTES, um deles
           por cinco pessoas. Como `cliente` tem índice único por telefone na
           organização (uq_cliente_org_telefone_active), gravar isso só tem
           dois desfechos: o pedido é recusado (foram 190) ou, pior, cinco
           compradores distintos viram um cliente só e o histórico de compra
           de um vira o do outro.

           Mesma situação do Mercado Livre, que também não dá contato do
           comprador. O e-mail-proxy (@scs2.tiktok.com) fica, esse sim é
           estável por comprador — 1352 distintos nos mesmos 1418 pedidos,
           zero colisão — e é o que sustenta a identidade do cliente.

           Telefone sem máscara, se um dia vier, passa normalmente. */
        clienteTelefone: telefoneUtilizavel(order.recipient_address?.phone_number),
        status: order.status.toLowerCase(),
        total: pg?.total_amount ?? order.payment_info?.total_amount ?? "",
        frete: pg?.shipping_fee,
        desconto: desconto > 0 ? desconto.toFixed(2) : undefined,
        acrescimo: pg?.handling_fee,
        itens: this.agruparItens(order),
        criadoEm: new Date(order.create_time * 1000),
        atualizadoOrigemEm: order.update_time ? new Date(order.update_time * 1000) : undefined,
        dadosOrigem: {
          status: order.status,
          financeiroInformado: !!(order.payment ?? order.payment_info),
          ...(typeof order.paid_time === "number" && Number.isFinite(order.paid_time)
            && order.paid_time > 0 && order.paid_time * 1000 <= Date.now()
            ? { pagamentoAprovado: true, pagoEmMs: order.paid_time * 1000 } : {}),
          ...(order.cancel_reason ? { motivoCancelamento: order.cancel_reason } : {}),
        },
      };
    });
  }

  /* ── O repasse do TikTok vem do extrato, não do pedido ──────────────────
   *
   *  `/order/202309/orders` entrega o bruto — o que o comprador pagou — e
   *  nada do que a plataforma retém: comissão, taxa de transação, frete real.
   *  Sem isso, Métricas conta como lucro dinheiro que nunca chegou na conta,
   *  a mesma distorção que a Shopee tinha antes do escrow. Medida aqui em
   *  03/09/2026 contra extratos reais da WUWU: as retenções são de 24% a 29%
   *  do bruto.
   *
   *  O caminho barato é o extrato, não o pedido. Existe
   *  `/finance/202501/orders/{id}/statement_transactions`, que responde por
   *  pedido — mas custa uma chamada por pedido (1.418 só na WUWU em 90 dias)
   *  e o TikTok já devolve 429 bem antes disso. O extrato traz os mesmos
   *  números em lote: algumas dezenas de chamadas cobrem o trimestre.
   *
   *  Pedido sem extrato ainda existe e responde 200 com tudo zerado (testado
   *  em pedido pago de hoje) — por isso `listarRepasses` descarta o que soma
   *  zero, em vez de gravar "o vendedor recebeu R$ 0,00".
   *
   *  Um pedido pode aparecer em mais de uma transação: a venda entra num
   *  extrato, a devolução em outro. Daí a SOMA por `order_id`, não o último
   *  valor visto — e daí também a janela larga de quem chama (ver
   *  DIAS_REPASSE_TIKTOK): uma devolução fora da janela deixaria o líquido
   *  alto demais até a varredura seguinte alcançá-la. */
  private static readonly EXTRATO_PAGINA = 50;

  private async listarExtratos(desdeMs: number, ateMs: number): Promise<string[]> {
    const ids: string[] = [];
    const vistos = new Set<string>();
    let cursor = "";
    for (let pagina = 0; pagina < 200; pagina++) {
      const data = await this.request<{ statements?: Array<{ id?: string }>; next_page_token?: string }>(
        "/finance/202309/statements",
        {
          query: {
            page_size: String(TikTokShopProvider.EXTRATO_PAGINA),
            /* `sort_field` é obrigatório: sem ele o TikTok recusa com
               "SortField is a required field" — 400, não 404. */
            sort_field: "statement_time",
            statement_time_ge: String(Math.floor(desdeMs / 1000)),
            statement_time_lt: String(Math.ceil(ateMs / 1000)),
            ...(cursor ? { page_token: cursor } : {}),
          },
          timeoutMs: 15_000,
        },
      );
      for (const extrato of data.statements ?? []) if (extrato.id) ids.push(extrato.id);
      const proximo = proximoCursorSeguro(cursor, data.next_page_token, Boolean(data.next_page_token), vistos, "TikTok extratos");
      if (proximo === null) return ids;
      cursor = proximo;
    }
    throw new Error("TikTok: extratos incompletos após 200 páginas.");
  }

  private async listarTransacoesDoExtrato(extratoId: string): Promise<TikTokTransacaoExtrato[]> {
    const transacoes: TikTokTransacaoExtrato[] = [];
    const vistos = new Set<string>();
    let cursor = "";
    for (let pagina = 0; pagina < 200; pagina++) {
      const data = await this.request<{ statement_transactions?: TikTokTransacaoExtrato[]; next_page_token?: string }>(
        `/finance/202309/statements/${extratoId}/statement_transactions`,
        {
          query: {
            page_size: String(TikTokShopProvider.EXTRATO_PAGINA),
            sort_field: "order_create_time",
            ...(cursor ? { page_token: cursor } : {}),
          },
          timeoutMs: 15_000,
        },
      );
      transacoes.push(...(data.statement_transactions ?? []));
      const proximo = proximoCursorSeguro(cursor, data.next_page_token, Boolean(data.next_page_token), vistos, "TikTok transações do extrato");
      if (proximo === null) return transacoes;
      cursor = proximo;
    }
    throw new Error("TikTok: transações do extrato incompletas após 200 páginas.");
  }

  /** Repasse por pedido, somado, dentro da janela de extratos varrida. */
  async listarRepasses(desde: Date, ate: Date = new Date(Date.now())): Promise<RepasseTikTok[]> {
    const transacoes: TikTokTransacaoExtrato[] = [];
    for (const extratoId of await this.listarExtratos(desde.getTime(), ate.getTime())) {
      transacoes.push(...await this.listarTransacoesDoExtrato(extratoId));
    }
    return agruparRepasses(transacoes);
  }

  /* ── Armazém único por loja ────────────────────────────────────────────
   *
   *  As três marcas foram conferidas ao vivo em 03/09/2026: TODO SKU de
   *  todo produto de uma loja tem o mesmo `warehouse_id` (fulfillment pelo
   *  próprio vendedor, sem centro de distribuição por variação). O saldo do
   *  Estoque leva o valor de `is_default: true` em /logistics/202309/warehouses
   *  (confirmado como o mesmo id que já aparece no inventário de qualquer
   *  produto — é o armazém "SALES_WAREHOUSE").
   *
   *  Por isso `EstoqueCanalRef.warehouseId` não é usado por este provider: com
   *  um armazém só, não há ambiguidade a resolver a partir do vínculo salvo, e
   *  resolver aqui evita gravar um terceiro identificador em produto_canal
   *  (que só tem os dois campos genéricos, já ocupados — ver o comentário em
   *  `mapearParaCatalogo`). Cacheado por instância: uma chamada por
   *  execução, não por produto. */
  private warehouseIdPadrao?: Promise<string>;
  private async obterWarehouseIdPadrao(): Promise<string> {
    this.warehouseIdPadrao ??= this.request<{
      warehouses?: Array<{ id: string; is_default?: boolean; type?: string }>;
    }>("/logistics/202309/warehouses", { timeoutMs: 8_000 }).then((data) => {
      const armazem = (data.warehouses ?? []).find((w) => w.is_default) ?? data.warehouses?.[0];
      if (!armazem) throw new Error("TikTok Shop não retornou nenhum armazém.");
      return armazem.id;
    });
    return this.warehouseIdPadrao;
  }

  /** Resolve o SKU pelo `warehouseId`, que no contrato genérico carrega o
   *  `sku.id` estável do TikTok. `skuId`/seller_sku fica apenas como fallback
   *  para vínculos legados; renomear o texto no Seller Center não rompe mais
   *  a leitura nem a escrita de estoque. */
  async sincronizarEstoque(referencia: EstoqueCanalRef, saldo: number): Promise<void> {
    const [produto, warehouseId] = await Promise.all([
      this.request<{ skus?: Array<{ id?: string; seller_sku?: string }> }>(
        `/product/202309/products/${referencia.listingId}`, { timeoutMs: 8_000 },
      ),
      this.obterWarehouseIdPadrao(),
    ]);
    const sku = selecionarSkuTikTok(produto.skus ?? [], referencia);
    if (!sku?.id) throw new Error(`TikTok Shop: SKU "${referencia.skuId}" não encontrado no anúncio ${referencia.listingId}.`);

    await this.request(`/product/202309/products/${referencia.listingId}/inventory/update`, {
      method: "POST",
      body: {
        skus: [{
          id: sku.id,
          inventory: [{ warehouse_id: warehouseId, quantity: saldo }],
        }],
      },
      timeoutMs: 8_000,
    });
  }

  async consultarEstoque(referencia: EstoqueCanalRef): Promise<number> {
    const product = await this.request<{
      skus?: Array<{
        id?: string;
        seller_sku?: string;
        inventory?: Array<{ quantity?: number }>;
      }>;
    }>(`/product/202309/products/${referencia.listingId}`, { timeoutMs: 8_000 });

    const sku = selecionarSkuTikTok(product.skus ?? [], referencia);
    // Um armazém só por loja (ver obterWarehouseIdPadrao): soma o inventário
    // inteiro do SKU, sem filtrar por warehouse_id.
    const saldo = (sku.inventory ?? []).reduce((sum, item) => sum + Number(item.quantity ?? 0), 0);
    if (!Number.isInteger(saldo) || saldo < 0) {
      throw new Error(`TikTok Shop retornou saldo inválido para anúncio ${referencia.listingId}.`);
    }
    return saldo;
  }

  /** Mesmo formato mínimo que `MLAnuncioCatalogo`/`ShopeeAnuncioCatalogo`
   *  precisam pro importador de Estoque (ver importar-catalogo.service.ts).
   *
   *  `variationId` recebe o `id` interno do SKU — não porque seja um "id de
   *  variação" pro TikTok (o conceito não existe na API dele: cada elemento
   *  de `skus[]` já é uma combinação completa, sem hierarquia produto→
   *  variação como a Shopee tem), mas porque `chaveVinculo` (o índice que
   *  evita importar o mesmo anúncio duas vezes) usa `(listingId, variationId)`
   *  para distinguir SKUs do mesmo produto — sem isso, os 4 SKUs de cor do
   *  mesmo anúncio colidiriam na mesma chave e só o primeiro seria salvo.
   *  `externalSku` carrega o `seller_sku` (texto do vendedor), que vira
   *  `produto.sku` e permanece visível na tela de Estoque. A identidade usada
   *  pela coleta, porém, é o `variationId`/`sku.id` estável. */
  async listarCatalogoAtivo(): Promise<TikTokAnuncioCatalogo[]> {
    const itens: TikTokAnuncioCatalogo[] = [];
    const cursores = new Set<string>();
    let cursor = "";
    for (let pagina = 0; pagina < 200; pagina++) {
      const data = await this.request<{
        products?: Array<{
          id: string;
          title: string;
          status?: string;
          skus?: Array<{
            id: string;
            seller_sku?: string;
            price?: { tax_exclusive_price?: string };
            inventory?: Array<{ quantity?: number }>;
          }>;
        }>;
        next_page_token?: string;
        total_count?: number;
      }>("/product/202309/products/search", {
        method: "POST",
        query: { page_size: "100", ...(cursor ? { page_token: cursor } : {}) },
        // "à venda" — mesmo filtro que ML (status=active) e Shopee
        // (item_status NORMAL) já aplicam: produto deletado/desativado não
        // vira produto novo no Estoque.
        body: { status: "ACTIVATE" },
        timeoutMs: 10_000,
      });
      if (!Array.isArray(data.products)) throw new Error("TikTok: catálogo sem array de produtos.");
      for (const produto of data.products) {
        for (const sku of produto.skus ?? []) {
          itens.push({
            listingId: produto.id,
            variationId: sku.id,
            externalSku: sku.seller_sku ?? null,
            title: produto.title,
            price: sku.price?.tax_exclusive_price ?? "0",
            availableQuantity: (sku.inventory ?? []).reduce((sum, i) => sum + Number(i.quantity ?? 0), 0),
          });
        }
      }
      const proximo = proximoCursorSeguro(cursor, data.next_page_token, Boolean(data.next_page_token), cursores, "TikTok catálogo");
      if (proximo === null) return itens;
      cursor = proximo;
    }
    throw new Error("TikTok: catálogo incompleto após 200 páginas.");
  }

  async saude(): Promise<SaudeConector> {
    const inicio = Date.now();
    try {
      await this.request<{ shops?: unknown[] }>("/seller/202309/shops", { timeoutMs: 5_000, semShopCipher: true });
      return { status: "ok", latenciaMs: Date.now() - inicio, mensagem: "Conectado", verificadoEm: new Date() };
    } catch (error) {
      return { status: "erro", latenciaMs: Date.now() - inicio, mensagem: String(error), verificadoEm: new Date() };
    }
  }
}

let supabaseTokenClient: ReturnType<typeof createClient> | undefined;

/** Access token do canal_tokens (canal "tiktokshop", gravado pelo fluxo OAuth
 *  em /api/tiktok/connect + /api/tiktok/callback) tem prioridade sobre
 *  TIKTOK_ACCESS_TOKEN_{BRAND} — mesmo padrão do fallback estático do ML
 *  (ver memória "ML env token placeholders"): só é lido quando não existe
 *  token persistido pra marca, nunca atualizado automaticamente. */
async function obterAccessTokenTikTok(brandSlug: BrandSlug): Promise<string | undefined> {
  const orgId = process.env.DEFAULT_ORG_ID;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const upper = brandEnvSuffix(brandSlug);
  const fallbackEnv = process.env[`TIKTOK_ACCESS_TOKEN_${upper}`];

  if (!orgId || !supabaseUrl || !serviceRoleKey) return fallbackEnv;

  supabaseTokenClient ??= createClient(supabaseUrl, serviceRoleKey);
  const supabase = supabaseTokenClient;

  const marca = await supabase
    .from("brand")
    .select("id")
    .eq("org_id", orgId)
    .eq("slug", brandSlug)
    .eq("active", true)
    .maybeSingle() as { data: { id: string } | null };
  if (!marca.data?.id) return fallbackEnv;

  const tokenRow = await supabase
    .from("canal_tokens")
    .select("access_token, expires_at")
    .eq("org_id", orgId)
    .eq("brand_id", marca.data.id)
    .eq("canal", "tiktokshop")
    .maybeSingle() as { data: { access_token: string; expires_at: string | null } | null };

  const expirado = tokenRow.data?.expires_at
    ? new Date(tokenRow.data.expires_at).getTime() <= Date.now() + 60_000
    : true;

  return expirado ? fallbackEnv : tokenRow.data?.access_token ?? fallbackEnv;
}

export async function criarTikTokShopProvider(brandSlug: BrandSlug): Promise<TikTokShopProvider> {
  const upper = brandEnvSuffix(brandSlug);
  const appKey = process.env.TIKTOK_APP_KEY;
  const appSecret = process.env.TIKTOK_APP_SECRET;
  const shopCipher = process.env[`TIKTOK_SHOP_CIPHER_${upper}`];
  const accessToken = await obterAccessTokenTikTok(brandSlug);

  if (!appKey || !appSecret || !accessToken || !shopCipher) {
    throw new Error(`Credenciais TikTok Shop não configuradas para ${upper}.`);
  }
  return new TikTokShopProvider({ appKey, appSecret, accessToken, shopCipher });
}
