import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { ingerirPedido } from "@/modules/canais/application/ingestao-pedido.service";
import { resolverContaWebhookMarketplace } from "@/modules/canais/application/webhook-account.service";
import { verificarRateLimit } from "@/shared/lib/rate-limit";
import { validarAssinaturaML } from "@/shared/lib/ml-signature";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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
  const bloqueio = await verificarRateLimit(req, "webhook");
  if (bloqueio) return bloqueio;

  const secret = process.env.ML_CLIENT_SECRET;
  if (secret) {
    const valido = validarAssinaturaML(
      req.headers.get("x-signature"),
      req.headers.get("x-request-id"),
      secret,
    );
    if (!valido) {
      return NextResponse.json({ error: "Assinatura inválida" }, { status: 401 });
    }
  }

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

    // Busca token no banco (OAuth) com fallback para env var legada
    let accessToken: string | undefined;
    const { data: tokenRow } = await supabase
      .from("canal_tokens")
      .select("access_token")
      .eq("org_id", process.env.DEFAULT_ORG_ID!)
      .eq("brand_id", conta.brandId)
      .eq("canal", "mercadolivre")
      .maybeSingle();

    accessToken = tokenRow?.access_token ?? process.env[`ML_ACCESS_TOKEN_${conta.brandSlug.toUpperCase()}`];
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
