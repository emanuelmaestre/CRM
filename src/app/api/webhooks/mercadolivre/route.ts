import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ingerirPedido } from "@/modules/canais/application/ingestao-pedido.service";
import { resolverContaWebhookMarketplace } from "@/modules/canais/application/webhook-account.service";

const MLNotificationSchema = z.object({
  resource: z.string(),
  topic: z.string(),
  user_id: z.number(),
  application_id: z.number().optional(),
  sent: z.string().optional(),
  attempts: z.number().optional(),
  received: z.string().optional(),
});

async function buscarPedidoML(orderId: string, accessToken: string) {
  const res = await fetch(`https://api.mercadolibre.com/orders/${orderId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`ML API ${res.status}`);
  return res.json() as Promise<{
    id: number;
    status: string;
    total_amount: number;
    shipping?: { cost?: number };
    buyer: { id: number; nickname: string; email?: string };
    order_items: { item: { seller_sku?: string }; quantity: number; unit_price: number }[];
    date_created: string;
  }>;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
  }

  const resultado = MLNotificationSchema.safeParse(body);
  if (!resultado.success) {
    return NextResponse.json({ error: "Schema inválido" }, { status: 422 });
  }

  const { topic, resource } = resultado.data;

  if (topic !== "orders_v2") {
    return NextResponse.json({ ok: true, ignorado: true, topic });
  }

  const orderId = resource.split("/orders/")[1];
  if (!orderId) return NextResponse.json({ ok: true, ignorado: true });

  try {
    const conta = await resolverContaWebhookMarketplace("mercadolivre", String(resultado.data.user_id));
    const accessToken = process.env[`ML_ACCESS_TOKEN_${conta.brandSlug.toUpperCase()}`];
    if (!accessToken) throw new Error(`Token Mercado Livre não configurado para ${conta.brandSlug}.`);
    const pedidoML = await buscarPedidoML(orderId, accessToken);

    const { pedidoId, novo } = await ingerirPedido(conta.orgId, conta.brandId, {
      providerOrderId: String(pedidoML.id),
      canal: "mercadolivre",
      clienteExternalId: String(pedidoML.buyer.id),
      clienteNome: pedidoML.buyer.nickname,
      clienteEmail: pedidoML.buyer.email,
      status: pedidoML.status,
      total: String(pedidoML.total_amount),
      frete: pedidoML.shipping?.cost !== undefined ? String(pedidoML.shipping.cost) : undefined,
      itens: pedidoML.order_items.map((item) => ({
        skuExterno: item.item.seller_sku ?? "",
        quantidade: item.quantity,
        precoUnitario: String(item.unit_price),
      })),
      criadoEm: new Date(pedidoML.date_created),
    });

    return NextResponse.json({ ok: true, pedidoId, novo });
  } catch (err) {
    console.error("[webhook/mercadolivre]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
