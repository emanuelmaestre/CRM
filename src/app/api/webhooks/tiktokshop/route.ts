import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ingerirPedido } from "@/modules/canais/application/ingestao-pedido.service";

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
  if (!appSecret) return true;

  const assinatura = req.headers.get("x-tts-signature") ?? "";
  const esperado = crypto
    .createHmac("sha256", appSecret)
    .update(rawBody)
    .digest("hex");

  return assinatura === esperado;
}

const ORDER_EVENTS = new Set([1, 2, 3, 4, 34]);

export async function POST(req: NextRequest): Promise<NextResponse> {
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

  const orgId = process.env.DEFAULT_ORG_ID ?? "";
  const brandId = process.env.NEXT_PUBLIC_BRAND_ID_KARZI ?? "";

  try {
    const { pedidoId, novo } = await ingerirPedido(orgId, brandId, {
      providerOrderId: data.order_id,
      canal: "tiktokshop",
      clienteExternalId: data.buyer_uid ?? data.order_id,
      clienteNome: `Comprador TikTok ${data.buyer_uid ?? ""}`.trim(),
      status: data.order_status?.toLowerCase() ?? "criado",
      total: data.total_amount ?? "0",
      itens: [],
      criadoEm: data.create_time ? new Date(data.create_time * 1000) : new Date(),
    });

    return NextResponse.json({ ok: true, pedidoId, novo });
  } catch (err) {
    console.error("[webhook/tiktokshop]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
