import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ingerirPedido } from "@/modules/canais/application/ingestao-pedido.service";
import { registrarVerificacaoCanal } from "@/modules/canais/application/verificacao-canal.service";
import { resolverContaWebhookMarketplace } from "@/modules/canais/application/webhook-account.service";
import { verificarRateLimit } from "@/shared/lib/rate-limit";
import { obterShopeeAppCredenciais } from "@/shared/config/shopee-env";
import { criarShopeeProvider, SHOPEE_PEDIDOS_LIBERADO } from "@/modules/canais/infrastructure/shopee.provider";
import { buscarPedidoComRegistro } from "@/modules/canais/application/recepcao-pedido.service";

const MAX_WEBHOOK_BYTES = 1_048_576;

// code 3 = atualização de status de pedido (documentado). code 20 = push de
// nova mensagem de chat, conforme integrações de referência da Shopee Open
// Platform v2 — CONFIRMAR o valor exato com logs reais de webhook durante a
// homologação da conta, pois a Shopee não publica uma tabela oficial estável
// de "code" por tipo de evento. Qualquer outro code continua sendo ignorado
// com 200, sem risco de processar dado incorreto.
const ShopeeWebhookEnvelopeSchema = z.object({
  code: z.number(),
  data: z.unknown(),
  shop_id: z.number(),
  timestamp: z.number(),
});

const ShopeeOrderDataSchema = z.object({
  ordersn: z.string(),
  status: z.string().optional(),
  buyer_username: z.string().optional(),
});

// Um só endpoint recebe webhook dos dois apps (catálogo/CRM manda push de
// chat, pedidos/Order Management manda push de status de pedido) — cada app
// assina com seu próprio partner_key, então valida contra os dois; qualquer
// um batendo confirma que a chamada é legítima.
function verificarAssinatura(req: NextRequest, rawBody: string): boolean {
  const assinatura = req.headers.get("authorization") ?? "";
  if (!/^[a-f0-9]{64}$/i.test(assinatura)) return false;
  const assinaturaBuf = Buffer.from(assinatura, "hex");

  const url = req.nextUrl.toString();
  const chaves = [obterShopeeAppCredenciais("catalogo").partnerKey, obterShopeeAppCredenciais("pedidos").partnerKey]
    .filter((k): k is string => Boolean(k));

  return chaves.some((partnerKey) => {
    const esperado = crypto.createHmac("sha256", partnerKey).update(`${url}|${rawBody}`).digest("hex");
    return crypto.timingSafeEqual(assinaturaBuf, Buffer.from(esperado, "hex"));
  });
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

  const envelope = ShopeeWebhookEnvelopeSchema.safeParse(body);
  if (!envelope.success) {
    return NextResponse.json({ error: "Schema inválido" }, { status: 422 });
  }
  const { code, shop_id } = envelope.data;

  if (code === 20) {
    // Inbox/mensagens foi removido. Confirmar o recebimento evita retentativas
    // da Shopee sem consultar token, pedido ou qualquer outro endpoint.
    return NextResponse.json({ ok: true, ignorado: true, motivo: "mensagens_desativadas" });
  }

  if (code !== 3) {
    return NextResponse.json({ ok: true, ignorado: true, code });
  }

  // App "Elisa Lima CRM" (Product Management) não tem permissão pra API de
  // Pedidos — get_order_detail abaixo sempre falharia. Responder 200 aqui
  // evita a Shopee reenviar o mesmo push em loop.
  if (!SHOPEE_PEDIDOS_LIBERADO) {
    return NextResponse.json({ ok: true, ignorado: true, motivo: "pedidos_api_nao_liberada" });
  }

  const pedidoResultado = ShopeeOrderDataSchema.safeParse(envelope.data.data);
  if (!pedidoResultado.success) {
    return NextResponse.json({ error: "Schema inválido" }, { status: 422 });
  }
  const data = pedidoResultado.data;

  try {
    const conta = await resolverContaWebhookMarketplace("shopee", String(shop_id));

    const normalizado = await buscarPedidoComRegistro(conta, data.ordersn, async () => {
      const provider = await criarShopeeProvider(conta.brandSlug);
      return provider.buscarPedidoPorId(data.ordersn);
    });
    const { pedidoId, novo } = await ingerirPedido(conta.orgId, conta.brandId, conta.channelAccountId, normalizado);

    /* Carimbo de "conferido agora" para o portão de entrada das telas. O
       webhook é o caminho NORMAL do pedido, e era justamente ele que o portão
       não enxergava: sem esta linha, cinco minutos depois da última execução
       da Central toda tela aberta mandava sincronizar de novo o pedido que
       este webhook acabou de gravar. */
    await registrarVerificacaoCanal(conta.orgId, conta.channelAccountId, "pedidos");

    return NextResponse.json({ ok: true, pedidoId, novo });
  } catch (err) {
    console.error("[webhook/shopee]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
