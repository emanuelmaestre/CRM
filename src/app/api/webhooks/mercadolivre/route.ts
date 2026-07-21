import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ingerirPedido } from "@/modules/canais/application/ingestao-pedido.service";

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
    buyer: { id: number; nickname: string; email?: string };
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

  const orgId = process.env.DEFAULT_ORG_ID ?? "";
  const brandId = process.env.NEXT_PUBLIC_BRAND_ID_KARZI ?? "";
  const accessToken = process.env.ML_ACCESS_TOKEN_KARZI ?? "";

  try {
    const pedidoML = await buscarPedidoML(orderId, accessToken);

    const { pedidoId, novo } = await ingerirPedido(orgId, brandId, {
      providerOrderId: String(pedidoML.id),
      canal: "mercadolivre",
      clienteExternalId: String(pedidoML.buyer.id),
      clienteNome: pedidoML.buyer.nickname,
      clienteEmail: pedidoML.buyer.email,
      status: pedidoML.status,
      total: String(pedidoML.total_amount),
      itens: [],
      criadoEm: new Date(pedidoML.date_created),
    });

    return NextResponse.json({ ok: true, pedidoId, novo });
  } catch (err) {
    console.error("[webhook/mercadolivre]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
