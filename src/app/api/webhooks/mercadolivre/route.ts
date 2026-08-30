import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ingerirPedido } from "@/modules/canais/application/ingestao-pedido.service";
import { buscarPedidoComRegistro } from "@/modules/canais/application/recepcao-pedido.service";
import { registrarVerificacaoCanal } from "@/modules/canais/application/verificacao-canal.service";
import { resolverContaWebhookMarketplace } from "@/modules/canais/application/webhook-account.service";
import { criarMLProvider, obterTokenMercadoLivre } from "@/modules/canais/infrastructure/mercadolivre.provider";
import { verificarRateLimit } from "@/shared/lib/rate-limit";
import { iniciarSyncTrace } from "@/shared/lib/observability/sync-trace";

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
  if (topic !== "orders_v2") {
    // Mensagens/perguntas não fazem mais parte do produto. Responder 200 aqui
    // impede repetição do webhook e, sobretudo, evita as chamadas de detalhe
    // que esse fluxo fazia ao Mercado Livre.
    return NextResponse.json({ ok: true, ignorado: true, topic });
  }

  // sync_id por notificação — resposta ao achado da auditoria de
  // performance ("hoje é impossível saber onde uma sincronização gastou
  // tempo"). As etapas seguem o mesmo agrupamento do exemplo original:
  // conta/token, chamadas à API do ML, e a escrita final no banco.
  const trace = iniciarSyncTrace("ml-webhook", { topic, resource, sellerId });

  try {
    const conta = await trace.etapa("resolver_conta_e_token", async () => {
      const c = await resolverContaWebhookMarketplace("mercadolivre", sellerId);
      const token = await obterTokenMercadoLivre(c.brandSlug);
      return { ...c, accessToken: token.accessToken, refreshToken: token.refreshToken };
    });
    const orderId = resource.split("/orders/")[1];
    if (!orderId) return NextResponse.json({ ok: true, ignorado: true, motivo: "sem-order-id" });

    // Reusa a mesma normalização da sync periódica (buscarPedidos) e do
    // backfill — antes este bloco montava o pedido à mão e nunca capturava
    // desconto/acréscimo/taxa do marketplace, além de usar o frete visto
    // pelo comprador em vez do custo real pago pelo vendedor.
    const provider = await criarMLProvider(conta.brandSlug, { accessToken: conta.accessToken, refreshToken: conta.refreshToken });
    const pedidoNormalizado = await trace.etapa("ml_api", () => buscarPedidoComRegistro(conta, orderId, () => provider.buscarPedidoPorId(orderId)));

    const pedido = await trace.etapa("database", () => ingerirPedido(
      conta.orgId, conta.brandId, conta.channelAccountId, pedidoNormalizado,
    ));

    /* Carimbo de "conferido agora" para o portão de entrada das telas. O
       webhook é o caminho NORMAL do pedido, e era justamente ele que o portão
       não enxergava: sem esta linha, cinco minutos depois da última execução
       da Central toda tela aberta mandava sincronizar de novo o pedido que
       este webhook acabou de gravar. */
    await registrarVerificacaoCanal(conta.orgId, conta.channelAccountId, "pedidos");

    trace.finalizar("ok");
    return NextResponse.json({ ok: true, ...pedido });
  } catch (error) {
    trace.finalizar("erro", error instanceof Error ? error.message : String(error));
    console.error("[webhook/mercadolivre]", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
