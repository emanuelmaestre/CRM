import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ingerirPedido } from "@/modules/canais/application/ingestao-pedido.service";
import { resolverContaWebhookMarketplace } from "@/modules/canais/application/webhook-account.service";
import { verificarRateLimit } from "@/shared/lib/rate-limit";
import { criarTikTokShopProvider } from "@/modules/canais/infrastructure/tiktokshop.provider";
import { receberMensagem } from "@/modules/inbox/application/inbox.service";

const MAX_WEBHOOK_BYTES = 1_048_576;

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

  const resultado = TikTokWebhookSchema.safeParse(body);
  if (!resultado.success) {
    console.error("[webhook/tiktokshop] schema inválido", JSON.stringify(body), resultado.error.issues);
    return NextResponse.json({ error: "Schema inválido" }, { status: 422 });
  }

  const { event, data, shop_id, type, tts_notification_id } = resultado.data;

  // Evento de ping/teste — responde 200 sem processar.
  if (event === "tiktok.ping") {
    return NextResponse.json({ ok: true, ignorado: true, event });
  }

  // Tipos 14 e 33 são notificações oficiais de nova mensagem. A deduplicação
  // definitiva ocorre por providerMessageId na tabela mensagem.
  if (type === 14 || type === 33) {
    const message = data as {
      message_id?: string;
      conversation_id?: string;
      content?: string;
      msg_type?: string;
      type?: string;
      create_time?: string | number;
      sender?: Record<string, unknown>;
    };
    if (!message.message_id || !message.conversation_id || !message.content) {
      return NextResponse.json({ error: "Mensagem TikTok incompleta" }, { status: 422 });
    }
    let conteudo = message.content;
    try {
      const parsed = JSON.parse(message.content) as { content?: unknown };
      if (typeof parsed.content === "string") conteudo = parsed.content;
    } catch {
      // Algumas versões enviam texto simples; ele já está pronto para persistência.
    }

    try {
      const conta = await resolverContaWebhookMarketplace("tiktokshop", shop_id);
      const inbox = await receberMensagem({
        orgId: conta.orgId,
        brandId: conta.brandId,
        channelAccountId: conta.channelAccountId,
        externalConversaId: message.conversation_id,
        providerMessageId: `tiktok:${message.message_id}`,
        conteudo,
        tipo: (message.msg_type ?? message.type ?? "TEXT").toLowerCase(),
        meta: {
          canal: "tiktokshop",
          notificationId: tts_notification_id,
          recebidaEm: message.create_time,
          sender: message.sender,
        },
      });
      return NextResponse.json({ ok: true, ...inbox });
    } catch (error) {
      console.error("[webhook/tiktokshop/inbox]", error);
      return NextResponse.json({ error: "Erro interno" }, { status: 500 });
    }
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
