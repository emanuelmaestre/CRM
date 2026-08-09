import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ingerirPedido } from "@/modules/canais/application/ingestao-pedido.service";
import { resolverContaWebhookMarketplace } from "@/modules/canais/application/webhook-account.service";
import { obterTokenMercadoLivre } from "@/modules/canais/infrastructure/mercadolivre.provider";
import { receberMensagem } from "@/modules/inbox/application/inbox.service";
import { verificarRateLimit } from "@/shared/lib/rate-limit";

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

  const clientId = process.env.ML_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "Webhook não configurado" }, { status: 503 });
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

  // Notificações da Mercado Livre (produto de marketplace) não usam assinatura
  // HMAC — esse mecanismo é do Mercado Pago, produto diferente. A forma
  // oficial de confirmar que a notificação é para o nosso app é conferir o
  // application_id do payload contra o client_id da aplicação.
  // https://developers.mercadolivre.com.br/pt_br/produto-receba-notificacoes
  if (String(resultado.data.application_id ?? "") !== clientId) {
    return NextResponse.json({ error: "Aplicação não reconhecida" }, { status: 401 });
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
        pack_id?: string | number;
        order_id?: string | number;
        to?: { user_id?: number };
        message_resources?: Array<{ id?: string | number; name?: string }>;
      }>(resource, accessToken);
      const messageId = message.message_id ?? message.id ?? resultado.data.id ?? resource;
      const conteudo = message.text?.plain ?? message.subject;
      if (!conteudo) {
        return NextResponse.json({ ok: true, ignorado: true, motivo: "mensagem-sem-texto" });
      }
      const packResource = message.message_resources?.find((item) => item.name === "packs");
      const packId = String(message.pack_id ?? packResource?.id ?? message.order_id ?? "");
      if (!packId) {
        return NextResponse.json({ ok: true, ignorado: true, motivo: "mensagem-sem-pack-id" });
      }
      // Notificações também podem refletir mensagens enviadas pelo próprio vendedor.
      if (String(message.from?.user_id ?? "") === sellerId) {
        return NextResponse.json({ ok: true, ignorado: true, motivo: "mensagem-de-saida" });
      }
      const inbox = await receberMensagem({
        orgId: conta.orgId,
        brandId: conta.brandId,
        channelAccountId: conta.channelAccountId,
        externalConversaId: message.conversation_id ?? `ml-pack:${packId}`,
        providerMessageId: `ml-message:${messageId}`,
        conteudo,
        tipo: "texto",
        meta: {
          canal: "mercadolivre",
          topic,
          remetenteId: message.from?.user_id,
          destinatarioId: message.from?.user_id === undefined ? undefined : String(message.from.user_id),
          sellerId,
          packId,
          orderId: message.order_id === undefined ? undefined : String(message.order_id),
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
        externalConversaId: `ml-question:${question.id ?? resource}`,
        providerMessageId: `ml-question:${question.id ?? resource}`,
        conteudo: question.text,
        tipo: "texto",
        meta: {
          canal: "mercadolivre",
          topic,
          itemId: question.item_id,
          questionId: String(question.id ?? resource.split("/").filter(Boolean).at(-1) ?? ""),
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
