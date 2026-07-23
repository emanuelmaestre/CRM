import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ingerirPedido } from "@/modules/canais/application/ingestao-pedido.service";
import { resolverContaWebhookMarketplace } from "@/modules/canais/application/webhook-account.service";
import { obterTokenMercadoLivre } from "@/modules/canais/infrastructure/mercadolivre.provider";
import { receberMensagem } from "@/modules/inbox/application/inbox.service";
import { verificarRateLimit } from "@/shared/lib/rate-limit";
import { validarAssinaturaML } from "@/shared/lib/ml-signature";

const MAX_WEBHOOK_BYTES = 1_048_576;

const MLNotificationSchema = z.object({
  id: z.string().optional(),
  resource: z.string().min(1),
  topic: z.string().min(1),
  user_id: z.union([z.string(), z.number()]).transform(String),
  application_id: z.number().optional(),
  actions: z.array(z.string()).optional(),
  sent: z.string().optional(),
  attempts: z.number().optional(),
  received: z.string().optional(),
});

async function buscarRecursoML<T>(resource: string, accessToken: string): Promise<T> {
  const path = resource.startsWith("/") ? resource : `/messages/${resource}`;
  const tag = path.startsWith("/messages/") ? `${path.includes("?") ? "&" : "?"}tag=post_sale` : "";
  const res = await fetch(`https://api.mercadolibre.com${path}${tag}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`Mercado Livre API ${res.status} em ${path}`);
  return res.json() as Promise<T>;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const bloqueio = await verificarRateLimit(req, "webhook");
  if (bloqueio) return bloqueio;

  const secret = process.env.ML_CLIENT_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Webhook não configurado" }, { status: 503 });
  }
  if (!validarAssinaturaML(
    req.headers.get("x-signature"),
    req.headers.get("x-request-id"),
    secret,
  )) {
    return NextResponse.json({ error: "Assinatura inválida" }, { status: 401 });
  }

  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (contentLength > MAX_WEBHOOK_BYTES) {
    return NextResponse.json({ error: "Payload excede 1 MB" }, { status: 413 });
  }
  const rawBody = await req.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_WEBHOOK_BYTES) {
    return NextResponse.json({ error: "Payload excede 1 MB" }, { status: 413 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
  }
  const resultado = MLNotificationSchema.safeParse(body);
  if (!resultado.success) {
    return NextResponse.json({ error: "Schema inválido" }, { status: 422 });
  }

  const { topic, resource, user_id: sellerId } = resultado.data;
  if (!["orders_v2", "messages", "questions"].includes(topic)) {
    return NextResponse.json({ ok: true, ignorado: true, topic });
  }

  try {
    const conta = await resolverContaWebhookMarketplace("mercadolivre", sellerId);
    const { accessToken } = await obterTokenMercadoLivre(conta.brandSlug);

    if (topic === "messages") {
      const message = await buscarRecursoML<{
        message_id?: string;
        id?: string;
        date?: string;
        from?: { user_id?: number };
        text?: { plain?: string };
        subject?: string;
        conversation_id?: string;
      }>(resource, accessToken);
      const messageId = message.message_id ?? message.id ?? resultado.data.id ?? resource;
      const conteudo = message.text?.plain ?? message.subject;
      if (!conteudo) {
        return NextResponse.json({ ok: true, ignorado: true, motivo: "mensagem-sem-texto" });
      }
      const inbox = await receberMensagem({
        orgId: conta.orgId,
        brandId: conta.brandId,
        channelAccountId: conta.channelAccountId,
        externalConversaId: message.conversation_id ?? resource,
        providerMessageId: `ml-message:${messageId}`,
        conteudo,
        tipo: "texto",
        meta: {
          canal: "mercadolivre",
          topic,
          remetenteId: message.from?.user_id,
          recebidaEm: message.date,
        },
      });
      return NextResponse.json({ ok: true, ...inbox });
    }

    if (topic === "questions") {
      const question = await buscarRecursoML<{
        id?: number;
        text?: string;
        date_created?: string;
        item_id?: string;
        from?: { id?: number };
      }>(resource, accessToken);
      if (!question.text) {
        return NextResponse.json({ ok: true, ignorado: true, motivo: "pergunta-sem-texto" });
      }
      const inbox = await receberMensagem({
        orgId: conta.orgId,
        brandId: conta.brandId,
        channelAccountId: conta.channelAccountId,
        externalConversaId: `ml-question:${question.item_id ?? resource}`,
        providerMessageId: `ml-question:${question.id ?? resource}`,
        conteudo: question.text,
        tipo: "texto",
        meta: {
          canal: "mercadolivre",
          topic,
          itemId: question.item_id,
          remetenteId: question.from?.id,
          recebidaEm: question.date_created,
        },
      });
      return NextResponse.json({ ok: true, ...inbox });
    }

    const orderId = resource.split("/orders/")[1];
    if (!orderId) return NextResponse.json({ ok: true, ignorado: true, motivo: "sem-order-id" });
    const pedidoML = await buscarRecursoML<{
      id: number;
      status: string;
      total_amount: number;
      shipping?: { cost?: number };
      buyer: { id: number; nickname: string; email?: string };
      order_items: Array<{
        item: { seller_sku?: string };
        quantity: number;
        unit_price: number;
      }>;
      date_created: string;
    }>(resource, accessToken);

    const pedido = await ingerirPedido(conta.orgId, conta.brandId, conta.channelAccountId, {
      providerOrderId: String(pedidoML.id),
      canal: "mercadolivre",
      clienteExternalId: String(pedidoML.buyer.id),
      clienteNome: pedidoML.buyer.nickname,
      clienteEmail: pedidoML.buyer.email,
      status: pedidoML.status,
      total: String(pedidoML.total_amount),
      frete: pedidoML.shipping?.cost === undefined ? undefined : String(pedidoML.shipping.cost),
      itens: pedidoML.order_items.map((item) => ({
        skuExterno: item.item.seller_sku ?? "",
        quantidade: item.quantity,
        precoUnitario: String(item.unit_price),
      })),
      criadoEm: new Date(pedidoML.date_created),
    });
    return NextResponse.json({ ok: true, ...pedido });
  } catch (error) {
    console.error("[webhook/mercadolivre]", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
