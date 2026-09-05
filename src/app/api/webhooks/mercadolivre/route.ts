import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { depoisDaResposta } from "@/shared/lib/depois-da-resposta";
import { inngest } from "@/shared/lib/inngest/client";

const MAX_WEBHOOK_BYTES = 1_048_576;

const MLNotificationSchema = z.object({
  id: z.string().max(200).optional(),
  resource: z.string().min(1).max(500),
  topic: z.string().min(1).max(100),
  user_id: z.union([z.string(), z.number()]).transform(String),
  application_id: z.number().optional(),
  actions: z.array(z.string()).optional(),
  sent: z.string().optional(),
  attempts: z.number().optional(),
  received: z.string().optional(),
});

function extrairOrderId(resource: string): string | null {
  const resultado = /^\/orders\/([^/?#]+)$/.exec(resource);
  return resultado?.[1] ?? null;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
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

  // Notificações do marketplace não usam o HMAC do Mercado Pago. O
  // application_id delimita o app; a fonte dos dados continua sendo o GET
  // autenticado do pedido feito pelo worker com o token daquela loja.
  if (String(resultado.data.application_id ?? "") !== clientId) {
    return NextResponse.json({ error: "Aplicação não reconhecida" }, { status: 401 });
  }

  const { topic, resource, user_id: sellerId } = resultado.data;
  if (topic !== "orders_v2") {
    return NextResponse.json({ ok: true, ignorado: true, topic });
  }

  const orderId = extrairOrderId(resource);
  if (!orderId) {
    return NextResponse.json({ ok: true, ignorado: true, motivo: "sem-order-id" });
  }

  const notificationId = `ml:${resultado.data.id ?? randomUUID()}`;
  console.info("[webhook/mercadolivre] recebido", {
    notificationId,
    orderId,
    sellerId,
    topic,
    resource,
    sent: resultado.data.sent,
    received: resultado.data.received,
    attempts: resultado.data.attempts,
    recebidoEm: new Date().toISOString(),
  });

  // O Mercado Livre exige confirmação em até 500 ms. A rota não acessa
  // banco, token nem API do canal: responde primeiro e usa o tempo de vida
  // estendido pelo Next apenas para publicar o evento no Inngest.
  depoisDaResposta(async () => {
    try {
      await inngest.send({
        id: notificationId,
        name: "canal/mercadolivre.pedido-notificado",
        data: {
          notificationId,
          orderId,
          sellerId,
          resource,
          sent: resultado.data.sent,
          received: resultado.data.received,
          attempts: resultado.data.attempts,
        },
      });
      console.info("[webhook/mercadolivre] enfileirado", { notificationId, orderId, sellerId });
    } catch (error) {
      // O A24 permanece como reconciliação de contingência. Este log torna
      // uma falha de entrega ao Inngest explicitamente pesquisável na Vercel.
      console.error("[webhook/mercadolivre] falha ao enfileirar", {
        notificationId,
        orderId,
        sellerId,
        error,
      });
    }
  });

  return NextResponse.json({ ok: true, aceito: true, orderId, notificationId });
}
