import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ingerirPedido } from "@/modules/canais/application/ingestao-pedido.service";
import { resolverContaWebhookMarketplace } from "@/modules/canais/application/webhook-account.service";
import { verificarRateLimit } from "@/shared/lib/rate-limit";

// Olist usa HMAC-SHA1 com a chave de API no header X-Olist-Signature
function verificarAssinatura(req: NextRequest, rawBody: string): boolean {
  const apiKey = process.env.OLIST_WEBHOOK_SECRET;
  if (!apiKey) return false;

  const assinatura = req.headers.get("x-olist-signature") ?? "";
  const esperado = crypto
    .createHmac("sha1", apiKey)
    .update(rawBody)
    .digest("hex");

  return /^[a-f0-9]{40}$/i.test(assinatura)
    && crypto.timingSafeEqual(Buffer.from(assinatura, "hex"), Buffer.from(esperado, "hex"));
}

const OlistWebhookSchema = z.object({
  event: z.string(),
  data: z.object({
    order_number: z.string(),
    store_id: z.string().optional(),
    status: z.string().optional(),
    total_amount: z.number().optional(),
    freight_amount: z.number().optional(),
    customer: z.object({
      name: z.string(),
      email: z.string().optional(),
      phone: z.string().optional(),
    }).optional(),
    created_at: z.string().optional(),
    items: z.array(z.object({
      seller_sku: z.string(),
      quantity: z.number(),
      unit_price: z.number(),
    })).optional(),
  }),
});

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

  const resultado = OlistWebhookSchema.safeParse(body);
  if (!resultado.success) {
    return NextResponse.json({ error: "Schema inválido" }, { status: 422 });
  }

  const { event, data } = resultado.data;

  // Só processa eventos de pedido
  if (!event.startsWith("order.")) {
    return NextResponse.json({ ok: true, ignorado: true, event });
  }

  const itens = (data.items ?? []).map((i) => ({
    skuExterno: i.seller_sku,
    quantidade: i.quantity,
    precoUnitario: String(i.unit_price),
  }));

  if (itens.length === 0) {
    return NextResponse.json({ ok: true, ignorado: true, motivo: "sem-itens" });
  }

  try {
    // Olist identifica a loja pelo store_id no payload; fallback para default
    const storeId = data.store_id ?? process.env.OLIST_SHOP_ID_KARZI ?? "";
    const conta = await resolverContaWebhookMarketplace("olist", storeId);

    const { pedidoId, novo } = await ingerirPedido(conta.orgId, conta.brandId, conta.channelAccountId, {
      providerOrderId: data.order_number,
      canal: "olist",
      clienteExternalId: data.customer?.email ?? data.order_number,
      clienteNome: data.customer?.name ?? "Cliente Olist",
      clienteEmail: data.customer?.email,
      clienteTelefone: data.customer?.phone,
      status: data.status ?? "criado",
      total: data.total_amount ? String(data.total_amount) : "0",
      frete: data.freight_amount ? String(data.freight_amount) : undefined,
      itens,
      criadoEm: data.created_at ? new Date(data.created_at) : new Date(),
    });

    return NextResponse.json({ ok: true, pedidoId, novo });
  } catch (err) {
    console.error("[webhook/olist]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
