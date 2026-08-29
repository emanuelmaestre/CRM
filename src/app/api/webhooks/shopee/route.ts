import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ingerirPedido } from "@/modules/canais/application/ingestao-pedido.service";
import { registrarVerificacaoCanal } from "@/modules/canais/application/verificacao-canal.service";
import { resolverContaWebhookMarketplace } from "@/modules/canais/application/webhook-account.service";
import { verificarRateLimit } from "@/shared/lib/rate-limit";
import { shopeeFetch } from "@/shared/lib/shopee-proxy";
import { obterShopeeAppCredenciais, obterShopeeBaseUrl } from "@/shared/config/shopee-env";
import { type BrandSlug } from "@/shared/config/brands";
import {
  extrairIncomePorPedido,
  normalizarFinanceiroShopee,
  obterTokenShopee,
  SHOPEE_PEDIDOS_LIBERADO,
  skuDoItemPedido,
  type ShopeeOrderIncome,
} from "@/modules/canais/infrastructure/shopee.provider";

const MAX_WEBHOOK_BYTES = 1_048_576;

// code 3 = atualização de status de pedido (documentado). code 20 = push de
// nova mensagem de chat, conforme integrações de referência da Shopee Open
// Platform v2 — CONFIRMAR o valor exato com logs reais de webhook durante a
// homologação da conta, pois a Shopee não publica uma tabela oficial estável
// de "code" por tipo de evento. Qualquer outro code continua sendo ignorado
// com 200, sem risco de processar dado incorreto.
const ShopeeWebhookEnvelopeSchema = z.object({
  code: z.number(),
  data: z.unknown(),
  shop_id: z.number(),
  timestamp: z.number(),
});

const ShopeeOrderDataSchema = z.object({
  ordersn: z.string(),
  status: z.string().optional(),
  buyer_username: z.string().optional(),
});

// Um só endpoint recebe webhook dos dois apps (catálogo/CRM manda push de
// chat, pedidos/Order Management manda push de status de pedido) — cada app
// assina com seu próprio partner_key, então valida contra os dois; qualquer
// um batendo confirma que a chamada é legítima.
function verificarAssinatura(req: NextRequest, rawBody: string): boolean {
  const assinatura = req.headers.get("authorization") ?? "";
  if (!/^[a-f0-9]{64}$/i.test(assinatura)) return false;
  const assinaturaBuf = Buffer.from(assinatura, "hex");

  const url = req.nextUrl.toString();
  const chaves = [obterShopeeAppCredenciais("catalogo").partnerKey, obterShopeeAppCredenciais("pedidos").partnerKey]
    .filter((k): k is string => Boolean(k));

  return chaves.some((partnerKey) => {
    const esperado = crypto.createHmac("sha256", partnerKey).update(`${url}|${rawBody}`).digest("hex");
    return crypto.timingSafeEqual(assinaturaBuf, Buffer.from(esperado, "hex"));
  });
}

/** `partnerId`/`partnerKey`/`shopId`/`accessToken` são os do app de PEDIDOS,
 *  usados no get_order_detail. `marca` vem junto porque o escrow é assinado
 *  por OUTRO app (Financeiro) e precisa buscar o token dele — mesma loja, mas
 *  tokens não intercambiáveis. */
async function buscarDetalheShopee(
  orderSn: string,
  marca: BrandSlug,
  partnerId: string,
  partnerKey: string,
  shopId: string,
  accessToken: string,
): Promise<{
  nomeCliente: string;
  telefonCliente?: string;
  total: string;
  frete?: string;
  desconto?: string;
  acrescimo?: string;
  valorLiquido?: string;
  itens: { skuExterno: string; quantidade: number; precoUnitario: string; taxaMarketplace?: string }[];
}> {
  const ts = Math.floor(Date.now() / 1000);
  const path = "/api/v2/order/get_order_detail";
  const base = `${partnerId}${path}${ts}${accessToken}${shopId}`;
  const sign = crypto.createHmac("sha256", partnerKey).update(base).digest("hex");

  const qs = new URLSearchParams({
    partner_id: partnerId,
    shop_id: shopId,
    access_token: accessToken,
    timestamp: String(ts),
    sign,
    order_sn_list: orderSn,
    response_optional_fields: "item_list,recipient_address,total_amount",
  });

  const res = await shopeeFetch(`${obterShopeeBaseUrl()}${path}?${qs}`, {
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) throw new Error(`Shopee detail HTTP ${res.status}`);

  type ShopeeItem = {
    item_id?: number;
    model_id?: number;
    item_sku?: string;
    model_sku?: string;
    model_quantity_purchased: number;
    model_discounted_price: number;
  };
  type ShopeeOrder = {
    order_sn: string;
    total_amount?: number;
    recipient_address?: { name: string; phone?: string };
    item_list?: ShopeeItem[];
  };

  const data = await res.json() as { response?: { order_list?: ShopeeOrder[] } };
  const order = data.response?.order_list?.[0];

  // O detalhe operacional não contém comissões nem o repasse. O financeiro é
  // uma chamada separada na Shopee, inclusive no webhook — e assinada por
  // OUTRO app: a API de Payment é da categoria Accounting And Finance ("Elisa
  // Lima Financeiro"), não Order Management. Assinada com o par de Pedidos,
  // como estava aqui, ela responde 403 error_api_permission — o mesmo 403 que
  // deixou todo pedido da Shopee entrar sem repasse até 28/08/2026.
  let income: ShopeeOrderIncome | undefined;
  try {
    const credsFinanceiro = obterShopeeAppCredenciais("financeiro");
    if (!credsFinanceiro.partnerId || !credsFinanceiro.partnerKey) {
      throw new Error("credenciais do app Shopee Financeiro não configuradas");
    }
    const tokenFinanceiro = await obterTokenShopee(marca, "financeiro");
    const financePath = "/api/v2/payment/get_escrow_detail_batch";
    const financeTs = Math.floor(Date.now() / 1000);
    const financeBase = `${credsFinanceiro.partnerId}${financePath}${financeTs}${tokenFinanceiro.accessToken}${tokenFinanceiro.shopId}`;
    const financeSign = crypto.createHmac("sha256", credsFinanceiro.partnerKey).update(financeBase).digest("hex");
    const financeQs = new URLSearchParams({
      partner_id: credsFinanceiro.partnerId,
      shop_id: tokenFinanceiro.shopId,
      access_token: tokenFinanceiro.accessToken,
      timestamp: String(financeTs),
      sign: financeSign,
    });
    const financeRes = await shopeeFetch(`${obterShopeeBaseUrl()}${financePath}?${financeQs}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order_sn_list: [orderSn] }),
      signal: AbortSignal.timeout(10000),
    });
    const financeData = await financeRes.json() as { error?: string };
    if (financeRes.ok && !financeData.error) {
      // Mesmo parser do provider: `response` é um array de escrow_detail.
      income = extrairIncomePorPedido(financeData).get(orderSn);
    }
  } catch (error) {
    // Marca sem o app Financeiro autorizado cai aqui e o pedido entra sem
    // repasse — a A34 preenche depois. Nunca derruba o webhook: perder o
    // push faria a Shopee reenviar o mesmo evento em loop.
    console.warn(`[webhook/shopee] financeiro ainda indisponível para ${orderSn}:`, error);
  }
  const financeiro = normalizarFinanceiroShopee(income, order?.item_list ?? []);

  return {
    nomeCliente: order?.recipient_address?.name ?? "Cliente Shopee",
    telefonCliente: order?.recipient_address?.phone,
    total: financeiro?.total ?? (order?.total_amount ? String(order.total_amount) : "0"),
    frete: financeiro?.frete,
    desconto: financeiro?.desconto,
    acrescimo: financeiro?.acrescimo,
    valorLiquido: financeiro?.valorLiquido,
    itens: (order?.item_list ?? []).map((i, indice) => ({
      skuExterno: skuDoItemPedido(i),
      quantidade: i.model_quantity_purchased,
      precoUnitario: String(i.model_discounted_price),
      taxaMarketplace: financeiro?.taxasMarketplace[indice],
    })),
  };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const bloqueio = await verificarRateLimit(req, "webhook");
  if (bloqueio) return bloqueio;

  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (contentLength > MAX_WEBHOOK_BYTES) {
    return NextResponse.json({ error: "Payload excede 1 MB" }, { status: 413 });
  }
  const rawBody = await req.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_WEBHOOK_BYTES) {
    return NextResponse.json({ error: "Payload excede 1 MB" }, { status: 413 });
  }

  if (!verificarAssinatura(req, rawBody)) {
    return NextResponse.json({ error: "Assinatura inválida" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
  }

  const envelope = ShopeeWebhookEnvelopeSchema.safeParse(body);
  if (!envelope.success) {
    return NextResponse.json({ error: "Schema inválido" }, { status: 422 });
  }
  const { code, shop_id } = envelope.data;

  if (code === 20) {
    // Inbox/mensagens foi removido. Confirmar o recebimento evita retentativas
    // da Shopee sem consultar token, pedido ou qualquer outro endpoint.
    return NextResponse.json({ ok: true, ignorado: true, motivo: "mensagens_desativadas" });
  }

  if (code !== 3) {
    return NextResponse.json({ ok: true, ignorado: true, code });
  }

  // App "Elisa Lima CRM" (Product Management) não tem permissão pra API de
  // Pedidos — get_order_detail abaixo sempre falharia. Responder 200 aqui
  // evita a Shopee reenviar o mesmo push em loop.
  if (!SHOPEE_PEDIDOS_LIBERADO) {
    return NextResponse.json({ ok: true, ignorado: true, motivo: "pedidos_api_nao_liberada" });
  }

  const pedidoResultado = ShopeeOrderDataSchema.safeParse(envelope.data.data);
  if (!pedidoResultado.success) {
    return NextResponse.json({ error: "Schema inválido" }, { status: 422 });
  }
  const data = pedidoResultado.data;

  try {
    const conta = await resolverContaWebhookMarketplace("shopee", String(shop_id));

    const { partnerId = "", partnerKey = "" } = obterShopeeAppCredenciais("pedidos");
    const { shopId, accessToken } = await obterTokenShopee(conta.brandSlug, "pedidos");

    const detalhe = await buscarDetalheShopee(data.ordersn, conta.brandSlug, partnerId, partnerKey, shopId, accessToken);

    const { pedidoId, novo } = await ingerirPedido(conta.orgId, conta.brandId, conta.channelAccountId, {
      providerOrderId: data.ordersn,
      canal: "shopee",
      clienteExternalId: data.buyer_username ?? data.ordersn,
      clienteNome: detalhe.nomeCliente,
      clienteTelefone: detalhe.telefonCliente,
      status: data.status ?? "criado",
      total: detalhe.total,
      frete: detalhe.frete,
      desconto: detalhe.desconto,
      acrescimo: detalhe.acrescimo,
      valorLiquido: detalhe.valorLiquido,
      itens: detalhe.itens,
      criadoEm: new Date(),
    });

    /* Carimbo de "conferido agora" para o portão de entrada das telas. O
       webhook é o caminho NORMAL do pedido, e era justamente ele que o portão
       não enxergava: sem esta linha, cinco minutos depois da última execução
       da Central toda tela aberta mandava sincronizar de novo o pedido que
       este webhook acabou de gravar. */
    await registrarVerificacaoCanal(conta.orgId, conta.channelAccountId, "pedidos");

    return NextResponse.json({ ok: true, pedidoId, novo });
  } catch (err) {
    console.error("[webhook/shopee]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
