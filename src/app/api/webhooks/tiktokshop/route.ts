import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ingerirPedido } from "@/modules/canais/application/ingestao-pedido.service";
import { resolverContaWebhookMarketplace } from "@/modules/canais/application/webhook-account.service";
import { verificarRateLimit } from "@/shared/lib/rate-limit";
import { criarTikTokShopProvider } from "@/modules/canais/infrastructure/tiktokshop.provider";

const TikTokWebhookSchema = z.object({
  event:       z.string().optional(),
  client_key:  z.string().optional(),
  create_time: z.number().optional(),
  timestamp:   z.number().optional(),
  tts_notification_id: z.string().optional(),
  shop_id:     z.union([z.string(), z.number()]).transform(String),
  type:        z.number(),
  data:        z.record(z.string(), z.unknown()).optional().default({}),
});

function verificarAssinatura(req: NextRequest, rawBody: string): boolean {
  const appSecret = process.env.TIKTOK_APP_SECRET;
  const appKey = process.env.TIKTOK_APP_KEY;
  if (!appSecret || !appKey) return false;

  const assinatura = req.headers.get("authorization") ?? "";
  if (!/^[a-f0-9]{64}$/i.test(assinatura)) return false;

  const esperado = crypto
    .createHmac("sha256", appSecret)
    .update(`${appKey}${rawBody}`)
    .digest("hex");

  return crypto.timingSafeEqual(Buffer.from(assinatura, "hex"), Buffer.from(esperado, "hex"));
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

  const resultado = TikTokWebhookSchema.safeParse(body);
  if (!resultado.success) {
    console.error("[webhook/tiktokshop] schema inválido", JSON.stringify(body), resultado.error.issues);
    return NextResponse.json({ error: "Schema inválido" }, { status: 422 });
  }

  const { event, data, shop_id } = resultado.data;

  // Evento de ping/teste — responde 200 sem processar.
  if (event === "tiktok.ping") {
    return NextResponse.json({ ok: true, ignorado: true, event });
  }

  // Extrai campos do data com cast seguro
  const d = data as {
    order_id?: string;
    order_status?: string;
    buyer_uid?: string;
    create_time?: number;
  };

  if (!d.order_id) {
    return NextResponse.json({ ok: true, ignorado: true, motivo: "sem_order_id" });
  }

  try {
    const conta = await resolverContaWebhookMarketplace("tiktokshop", shop_id);

    const provider = criarTikTokShopProvider(conta.brandSlug);
    const pedido = (await provider.buscarPedidosPorIds([d.order_id]))[0];
    if (!pedido) throw new Error(`TikTok Shop não retornou o pedido ${d.order_id}.`);

    const { pedidoId, novo } = await ingerirPedido(
      conta.orgId,
      conta.brandId,
      conta.channelAccountId,
      pedido,
    );

    return NextResponse.json({ ok: true, pedidoId, novo });
  } catch (err) {
    console.error("[webhook/tiktokshop]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
