import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ingerirPedido } from "@/modules/canais/application/ingestao-pedido.service";
import { resolverContaWebhookMarketplace } from "@/modules/canais/application/webhook-account.service";

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
  if (!partnerKey) return false; // bloqueia se chave não configurada

  const assinatura = req.headers.get("authorization") ?? "";
  const url = req.nextUrl.toString();
  const esperado = crypto
    .createHmac("sha256", partnerKey)
    .update(`${url}|${rawBody}`)
    .digest("hex");

  return assinatura === esperado;
}

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

  const resultado = ShopeeWebhookSchema.safeParse(body);
  if (!resultado.success) {
    return NextResponse.json({ error: "Schema inválido" }, { status: 422 });
  }

  const { code, data } = resultado.data;

  if (code !== 3) {
    return NextResponse.json({ ok: true, ignorado: true, code });
  }

  try {
    const conta = await resolverContaWebhookMarketplace("shopee", String(resultado.data.shop_id));
    const { pedidoId, novo } = await ingerirPedido(conta.orgId, conta.brandId, {
      providerOrderId: data.ordersn,
      canal: "shopee",
      clienteExternalId: data.buyer_username ?? data.ordersn,
      clienteNome: data.buyer_username ?? "Cliente Shopee",
      status: data.status ?? "criado",
      total: "0",
      itens: [],
      criadoEm: new Date(),
    });

    return NextResponse.json({ ok: true, pedidoId, novo });
  } catch (err) {
    console.error("[webhook/shopee]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
