import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ingerirPedido } from "@/modules/canais/application/ingestao-pedido.service";
import { buscarPedidoComRegistro } from "@/modules/canais/application/recepcao-pedido.service";
import { resolverContaWebhookMarketplace } from "@/modules/canais/application/webhook-account.service";
import { verificarRateLimit } from "@/shared/lib/rate-limit";
import { criarTikTokShopProvider } from "@/modules/canais/infrastructure/tiktokshop.provider";
import {
  resolverContaTikTokPorLoja,
  tratarDesautorizacaoTikTok,
  tratarExpiracaoAutorizacaoTikTok,
} from "@/modules/canais/application/tiktok-autorizacao.service";

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

  const { event, data, shop_id, type } = resultado.data;

  // Evento de ping/teste — responde 200 sem processar.
  if (event === "tiktok.ping") {
    return NextResponse.json({ ok: true, ignorado: true, event });
  }

  // Inbox/mensagens foi removido. Confirmar o recebimento evita retentativas
  // do TikTok sem resolver conta nem gravar conversa/evento no banco.
  if (type === 14 || type === 33) {
    return NextResponse.json({ ok: true, ignorado: true, motivo: "mensagens_desativadas" });
  }

  /* Fim de autorização: Tipo 6 é desautorização do vendedor, Tipo 7 é aviso de
     expiração. Os dois já vinham assinados no Partner Center, mas morriam no
     descarte por "sem_order_id" mais abaixo — o TikTok recebia 200 e o CRM não
     guardava nada. Ficam ANTES daquele descarte, e só deles, porque nenhum dos
     dois carrega pedido. O Tipo 1 segue exatamente pelo caminho de antes. */
  if (type === 6 || type === 7) {
    const conta = await resolverContaTikTokPorLoja(shop_id);
    if (!conta) {
      // 200 de propósito: se a loja não é reconhecida aqui, retentativa do
      // TikTok vai dar exatamente no mesmo lugar. O log é o que permite achar
      // o identificador que não casou com nenhuma conta.
      console.error(`[webhook/tiktokshop] tipo ${type} de loja não reconhecida: ${shop_id}`);
      return NextResponse.json({ ok: true, ignorado: true, motivo: "loja_nao_reconhecida" });
    }
    try {
      if (type === 6) {
        const { tokensRemovidos } = await tratarDesautorizacaoTikTok(conta, { shopId: shop_id });
        return NextResponse.json({ ok: true, tratado: "desautorizacao", tokensRemovidos });
      }
      await tratarExpiracaoAutorizacaoTikTok(conta, { shopId: shop_id });
      return NextResponse.json({ ok: true, tratado: "expiracao_autorizacao" });
    } catch (err) {
      console.error(`[webhook/tiktokshop] tipo ${type}`, err);
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

    const provider = await criarTikTokShopProvider(conta.brandSlug);
    const orderId = d.order_id;
    const pedido = await buscarPedidoComRegistro(conta, orderId, async () => {
      const encontrado = (await provider.buscarPedidosPorIds([orderId]))[0];
      if (!encontrado) throw new Error(`TikTok Shop não retornou o pedido ${orderId}.`);
      return encontrado;
    });

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
