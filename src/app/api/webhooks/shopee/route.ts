import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ingerirPedido } from "@/modules/canais/application/ingestao-pedido.service";
import { resolverContaWebhookMarketplace } from "@/modules/canais/application/webhook-account.service";
import { verificarRateLimit } from "@/shared/lib/rate-limit";

const ShopeeWebhookSchema = z.object({
  code: z.number(),
  data: z.object({
    ordersn: z.string(),
    status: z.string().optional(),
    buyer_username: z.string().optional(),
  }),
  shop_id: z.number(),
  timestamp: z.number(),
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

  return assinatura === esperado;
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

  const res = await fetch(`https://partner.shopeemobile.com${path}?${qs}`, {
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

  const rawBody = await req.text();

  if (!verificarAssinatura(req, rawBody)) {
    return NextResponse.json({ error: "Assinatura inválida" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
  }

  const resultado = ShopeeWebhookSchema.safeParse(body);
  if (!resultado.success) {
    return NextResponse.json({ error: "Schema inválido" }, { status: 422 });
  }

  const { code, data } = resultado.data;

  // code 3 = novo pedido; code 4 = atualização de status
  if (code !== 3 && code !== 4) {
    return NextResponse.json({ ok: true, ignorado: true, code });
  }

  try {
    const conta = await resolverContaWebhookMarketplace("shopee", String(resultado.data.shop_id));

    const upper = conta.brandSlug.toUpperCase() as "KARZI" | "WUWU";
    const partnerId = process.env.SHOPEE_PARTNER_ID ?? "";
    const partnerKey = process.env.SHOPEE_PARTNER_KEY ?? "";
    const shopId = process.env[`SHOPEE_SHOP_ID_${upper}`] ?? "";
    const accessToken = process.env[`SHOPEE_ACCESS_TOKEN_${upper}`] ?? "";

    const detalhe = await buscarDetalheShopee(data.ordersn, partnerId, partnerKey, shopId, accessToken);

    const { pedidoId, novo } = await ingerirPedido(conta.orgId, conta.brandId, {
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
