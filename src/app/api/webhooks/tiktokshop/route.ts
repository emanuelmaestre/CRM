import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ingerirPedido } from "@/modules/canais/application/ingestao-pedido.service";
import { resolverContaWebhookMarketplace } from "@/modules/canais/application/webhook-account.service";
import { verificarRateLimit } from "@/shared/lib/rate-limit";

const TikTokWebhookSchema = z.object({
  type: z.number(),
  shop_id: z.string(),
  data: z.object({
    order_id: z.string().optional(),
    order_status: z.string().optional(),
    buyer_uid: z.string().optional(),
    total_amount: z.string().optional(),
    create_time: z.number().optional(),
  }),
  timestamp: z.number(),
});

function verificarAssinatura(req: NextRequest, rawBody: string): boolean {
  const appSecret = process.env.TIKTOK_APP_SECRET;
  if (!appSecret) return false;

  const assinatura = req.headers.get("x-tts-signature") ?? "";
  const esperado = crypto
    .createHmac("sha256", appSecret)
    .update(rawBody)
    .digest("hex");

  return assinatura === esperado;
}

async function buscarDetalheTikTok(
  orderId: string,
  appKey: string,
  appSecret: string,
  accessToken: string,
  shopId: string,
): Promise<{
  nomeCliente: string;
  total: string;
  itens: { skuExterno: string; quantidade: number; precoUnitario: string }[];
}> {
  const timestamp = Math.floor(Date.now() / 1000);
  const path = "/order/202309/orders";

  const baseParams: Record<string, string> = {
    app_key: appKey,
    shop_id: shopId,
    timestamp: String(timestamp),
    access_token: accessToken,
    ids: orderId,
  };

  const sortedParams = Object.keys(baseParams)
    .filter((k) => k !== "sign" && k !== "access_token")
    .sort()
    .map((k) => `${k}${baseParams[k]}`)
    .join("");

  const signBase = `${appSecret}${path}${sortedParams}${timestamp}`;
  const sign = crypto.createHmac("sha256", appSecret).update(signBase).digest("hex");

  const qs = new URLSearchParams({ ...baseParams, sign });
  const res = await fetch(`https://open-api.tiktokglobalshop.com${path}?${qs}`, {
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) throw new Error(`TikTok detail HTTP ${res.status}`);

  type TikTokItem = { seller_sku: string; quantity: number; sale_price: string };
  type TikTokOrder = {
    id: string;
    payment_info?: { total_amount: string };
    recipient_address?: { name: string };
    line_items?: TikTokItem[];
  };

  const data = await res.json() as { data?: { orders?: TikTokOrder[] } };
  const order = data.data?.orders?.[0];

  return {
    nomeCliente: order?.recipient_address?.name ?? `Comprador TikTok`,
    total: order?.payment_info?.total_amount ?? "0",
    itens: (order?.line_items ?? []).map((i) => ({
      skuExterno: i.seller_sku,
      quantidade: i.quantity,
      precoUnitario: i.sale_price,
    })),
  };
}

// Tipos de evento de pedido: 1=criado, 2=atualizado, 3=cancelado, 4=enviado, 34=entregue
const ORDER_EVENTS = new Set([1, 2, 3, 4, 34]);

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

  const resultado = TikTokWebhookSchema.safeParse(body);
  if (!resultado.success) {
    return NextResponse.json({ error: "Schema inválido" }, { status: 422 });
  }

  const { type, data } = resultado.data;

  if (!ORDER_EVENTS.has(type) || !data.order_id) {
    return NextResponse.json({ ok: true, ignorado: true, type });
  }

  try {
    const conta = await resolverContaWebhookMarketplace("tiktokshop", resultado.data.shop_id);

    const upper = conta.brandSlug.toUpperCase() as "KARZI" | "WUWU";
    const appKey = process.env.TIKTOK_APP_KEY ?? "";
    const appSecret = process.env.TIKTOK_APP_SECRET ?? "";
    const accessToken = process.env[`TIKTOK_ACCESS_TOKEN_${upper}`] ?? "";
    const shopId = process.env[`TIKTOK_SHOP_ID_${upper}`] ?? "";

    const detalhe = await buscarDetalheTikTok(data.order_id, appKey, appSecret, accessToken, shopId);

    const { pedidoId, novo } = await ingerirPedido(conta.orgId, conta.brandId, {
      providerOrderId: data.order_id,
      canal: "tiktokshop",
      clienteExternalId: data.buyer_uid ?? data.order_id,
      clienteNome: detalhe.nomeCliente,
      status: data.order_status?.toLowerCase() ?? "criado",
      total: detalhe.total,
      itens: detalhe.itens,
      criadoEm: data.create_time ? new Date(data.create_time * 1000) : new Date(),
    });

    return NextResponse.json({ ok: true, pedidoId, novo });
  } catch (err) {
    console.error("[webhook/tiktokshop]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
