import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ingerirPedido } from "@/modules/canais/application/ingestao-pedido.service";
import { resolverContaWebhookMarketplace } from "@/modules/canais/application/webhook-account.service";
import { verificarRateLimit } from "@/shared/lib/rate-limit";
import { receberMensagem } from "@/modules/inbox/application/inbox.service";
import { brandEnvSuffix } from "@/shared/config/brands";
import { shopeeFetch } from "@/shared/lib/shopee-proxy";

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

const ShopeeMessageDataSchema = z.object({
  conversation_id: z.union([z.string(), z.number()]).transform(String),
  message_id: z.union([z.string(), z.number()]).transform(String),
  message_type: z.string().optional(),
  content: z.union([z.string(), z.record(z.string(), z.unknown())]).optional(),
  from_id: z.union([z.string(), z.number()]).optional(),
  to_id: z.union([z.string(), z.number()]).optional(),
});

function verificarAssinatura(req: NextRequest, rawBody: string): boolean {
  const partnerKey = process.env.SHOPEE_PARTNER_KEY;
  if (!partnerKey) return false;

  const assinatura = req.headers.get("authorization") ?? "";
  const url = req.nextUrl.toString();
  const esperado = crypto
    .createHmac("sha256", partnerKey)
    .update(`${url}|${rawBody}`)
    .digest("hex");

  return /^[a-f0-9]{64}$/i.test(assinatura)
    && crypto.timingSafeEqual(Buffer.from(assinatura, "hex"), Buffer.from(esperado, "hex"));
}

async function buscarDetalheShopee(
  orderSn: string,
  partnerId: string,
  partnerKey: string,
  shopId: string,
  accessToken: string,
): Promise<{
  nomeCliente: string;
  telefonCliente?: string;
  total: string;
  itens: { skuExterno: string; quantidade: number; precoUnitario: string }[];
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

  const res = await shopeeFetch(`https://partner.shopeemobile.com${path}?${qs}`, {
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) throw new Error(`Shopee detail HTTP ${res.status}`);

  type ShopeeItem = { item_sku: string; model_quantity_purchased: number; model_discounted_price: number };
  type ShopeeOrder = {
    order_sn: string;
    total_amount?: number;
    recipient_address?: { name: string; phone?: string };
    item_list?: ShopeeItem[];
  };

  const data = await res.json() as { response?: { order_list?: ShopeeOrder[] } };
  const order = data.response?.order_list?.[0];

  return {
    nomeCliente: order?.recipient_address?.name ?? "Cliente Shopee",
    telefonCliente: order?.recipient_address?.phone,
    total: order?.total_amount ? String(order.total_amount) : "0",
    itens: (order?.item_list ?? []).map((i) => ({
      skuExterno: i.item_sku,
      quantidade: i.model_quantity_purchased,
      precoUnitario: String(i.model_discounted_price),
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
    const mensagem = ShopeeMessageDataSchema.safeParse(envelope.data.data);
    if (!mensagem.success) {
      return NextResponse.json({ error: "Mensagem Shopee incompleta" }, { status: 422 });
    }
    const msgData = mensagem.data;
    let conteudo = typeof msgData.content === "string" ? msgData.content : JSON.stringify(msgData.content ?? "");
    if (typeof msgData.content === "object" && msgData.content && "text" in msgData.content && typeof msgData.content.text === "string") {
      conteudo = msgData.content.text;
    }
    if (!conteudo) {
      return NextResponse.json({ ok: true, ignorado: true, motivo: "mensagem_sem_conteudo" });
    }

    try {
      const conta = await resolverContaWebhookMarketplace("shopee", String(shop_id));
      const inbox = await receberMensagem({
        orgId: conta.orgId,
        brandId: conta.brandId,
        channelAccountId: conta.channelAccountId,
        externalConversaId: msgData.conversation_id,
        providerMessageId: `shopee:${msgData.message_id}`,
        conteudo,
        tipo: (msgData.message_type ?? "text").toLowerCase(),
        meta: { canal: "shopee", fromId: msgData.from_id, toId: msgData.to_id },
      });
      return NextResponse.json({ ok: true, ...inbox });
    } catch (error) {
      console.error("[webhook/shopee/inbox]", error);
      return NextResponse.json({ error: "Erro interno" }, { status: 500 });
    }
  }

  if (code !== 3) {
    return NextResponse.json({ ok: true, ignorado: true, code });
  }

  const pedidoResultado = ShopeeOrderDataSchema.safeParse(envelope.data.data);
  if (!pedidoResultado.success) {
    return NextResponse.json({ error: "Schema inválido" }, { status: 422 });
  }
  const data = pedidoResultado.data;

  try {
    const conta = await resolverContaWebhookMarketplace("shopee", String(shop_id));

    const upper = brandEnvSuffix(conta.brandSlug);
    const partnerId = process.env.SHOPEE_PARTNER_ID ?? "";
    const partnerKey = process.env.SHOPEE_PARTNER_KEY ?? "";
    const shopId = process.env[`SHOPEE_SHOP_ID_${upper}`] ?? "";
    const accessToken = process.env[`SHOPEE_ACCESS_TOKEN_${upper}`] ?? "";

    const detalhe = await buscarDetalheShopee(data.ordersn, partnerId, partnerKey, shopId, accessToken);

    const { pedidoId, novo } = await ingerirPedido(conta.orgId, conta.brandId, conta.channelAccountId, {
      providerOrderId: data.ordersn,
      canal: "shopee",
      clienteExternalId: data.buyer_username ?? data.ordersn,
      clienteNome: detalhe.nomeCliente,
      clienteTelefone: detalhe.telefonCliente,
      status: data.status ?? "criado",
      total: detalhe.total,
      itens: detalhe.itens,
      criadoEm: new Date(),
    });

    return NextResponse.json({ ok: true, pedidoId, novo });
  } catch (err) {
    console.error("[webhook/shopee]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
