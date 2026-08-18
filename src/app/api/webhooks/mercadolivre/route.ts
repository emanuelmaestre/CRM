import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ingerirPedido } from "@/modules/canais/application/ingestao-pedido.service";
import { resolverContaWebhookMarketplace } from "@/modules/canais/application/webhook-account.service";
import { obterTokenMercadoLivre } from "@/modules/canais/infrastructure/mercadolivre.provider";
import { receberMensagem, resolverClientePorIdentidade } from "@/modules/inbox/application/inbox.service";
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

// Fallback de identificação: quando o comprador ainda não tem cliente
// vinculado (nenhum pedido sincronizado ainda), buscamos o nome dele
// diretamente na API pública do ML pra não deixar o Inbox mostrando só o
// ID técnico do pacote/pergunta. Best-effort — se falhar, segue sem nome.
async function buscarNomeCompradorML(userId: number | undefined, accessToken: string): Promise<string | undefined> {
  if (!userId) return undefined;
  try {
    const usuario = await buscarRecursoML<{
      nickname?: string;
      first_name?: string;
      last_name?: string;
      address?: { city?: string; state?: string };
    }>(`/users/${userId}`, accessToken);
    const nomeCompleto = [usuario.first_name, usuario.last_name].filter(Boolean).join(" ").trim();
    if (nomeCompleto) return nomeCompleto;
    // Pré-venda (sem pedido ainda): a API pública do ML não expõe nome real
    // por privacidade, só o apelido — por isso ele vem rotulado, e a
    // cidade/estado (também público) entra como complemento pra identificar
    // melhor. Assim que um pedido for sincronizado, isso é substituído pelo
    // nome completo real do destinatário da entrega.
    if (!usuario.nickname) return undefined;
    const estado = usuario.address?.state?.replace(/^BR-/, "");
    const local = [usuario.address?.city, estado].filter(Boolean).join("/");
    return local ? `${usuario.nickname} (apelido) · ${local}` : `${usuario.nickname} (apelido)`;
  } catch {
    return undefined;
  }
}

// Identifica o(s) produto(s) do pedido pra exibir no Inbox no lugar do
// número de pacote cru (ver seller_sku ↔ produto.sku em ingestao-pedido.service).
// Best-effort — se falhar, a conversa cai de volta pro "Pacote X".
async function buscarProdutosPedidoML(orderId: string | number | undefined, accessToken: string): Promise<string[]> {
  if (!orderId) return [];
  try {
    const order = await buscarRecursoML<{ order_items?: Array<{ item?: { title?: string } }> }>(`/orders/${orderId}`, accessToken);
    return (order.order_items ?? []).map((i) => i.item?.title).filter((t): t is string => !!t);
  } catch {
    return [];
  }
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

  // sync_id por notificação — resposta ao achado da auditoria de
  // performance ("hoje é impossível saber onde uma sincronização gastou
  // tempo"). As etapas seguem o mesmo agrupamento do exemplo original:
  // conta/token, chamadas à API do ML, e a escrita final no banco.
  const trace = iniciarSyncTrace("ml-webhook", { topic, resource, sellerId });

  try {
    const conta = await trace.etapa("resolver_conta_e_token", async () => {
      const c = await resolverContaWebhookMarketplace("mercadolivre", sellerId);
      const { accessToken } = await obterTokenMercadoLivre(c.brandSlug);
      return { ...c, accessToken };
    });
    const { accessToken } = conta;

    if (topic === "messages") {
      const message = await trace.etapa("ml_api", () => buscarRecursoML<{
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
      }>(resource, accessToken));
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
      const clienteId = await resolverClientePorIdentidade(conta.orgId, "mercadolivre", message.from?.user_id);
      const remetenteNome = clienteId ? undefined : await buscarNomeCompradorML(message.from?.user_id, accessToken);
      const produtos = await buscarProdutosPedidoML(message.order_id, accessToken);
      const inbox = await trace.etapa("database", () => receberMensagem({
        orgId: conta.orgId,
        brandId: conta.brandId,
        channelAccountId: conta.channelAccountId,
        clienteId,
        externalConversaId: message.conversation_id ?? `ml-pack:${packId}`,
        providerMessageId: `ml-message:${messageId}`,
        conteudo,
        tipo: "texto",
        meta: {
          canal: "mercadolivre",
          topic,
          remetenteId: message.from?.user_id,
          remetenteNome,
          produtos: produtos.length ? produtos : undefined,
          destinatarioId: message.from?.user_id === undefined ? undefined : String(message.from.user_id),
          sellerId,
          packId,
          orderId: message.order_id === undefined ? undefined : String(message.order_id),
          recebidaEm: message.date,
        },
      }));
      trace.finalizar("ok");
      return NextResponse.json({ ok: true, ...inbox });
    }

    if (topic === "questions") {
      const question = await trace.etapa("ml_api", () => buscarRecursoML<{
        id?: number;
        text?: string;
        date_created?: string;
        item_id?: string;
        from?: { id?: number };
      }>(resource, accessToken));
      const textoPergunta = question.text;
      if (!textoPergunta) {
        return NextResponse.json({ ok: true, ignorado: true, motivo: "pergunta-sem-texto" });
      }
      const clienteIdPergunta = await resolverClientePorIdentidade(conta.orgId, "mercadolivre", question.from?.id);
      const remetenteNomePergunta = clienteIdPergunta ? undefined : await buscarNomeCompradorML(question.from?.id, accessToken);
      const inbox = await trace.etapa("database", () => receberMensagem({
        orgId: conta.orgId,
        brandId: conta.brandId,
        channelAccountId: conta.channelAccountId,
        clienteId: clienteIdPergunta,
        externalConversaId: `ml-question:${question.id ?? resource}`,
        providerMessageId: `ml-question:${question.id ?? resource}`,
        conteudo: textoPergunta,
        tipo: "texto",
        meta: {
          canal: "mercadolivre",
          topic,
          itemId: question.item_id,
          questionId: String(question.id ?? resource.split("/").filter(Boolean).at(-1) ?? ""),
          remetenteId: question.from?.id,
          remetenteNome: remetenteNomePergunta,
          recebidaEm: question.date_created,
        },
      }));
      trace.finalizar("ok");
      return NextResponse.json({ ok: true, ...inbox });
    }

    const orderId = resource.split("/orders/")[1];
    if (!orderId) return NextResponse.json({ ok: true, ignorado: true, motivo: "sem-order-id" });
    const { pedidoML, endereco } = await trace.etapa("ml_api", async () => {
      const dadosPedido = await buscarRecursoML<{
        id: number;
        status: string;
        total_amount: number;
        shipping?: { id?: number; cost?: number };
        buyer: { id: number; nickname: string; email?: string };
        order_items: Array<{
          item: { seller_sku?: string };
          quantity: number;
          unit_price: number;
        }>;
        date_created: string;
      }>(resource, accessToken);

      // Nome completo e endereço só vêm numa chamada separada a /shipments/{id}
      // — mesma lógica de buscarEnderecoEntrega() em mercadolivre.provider.ts.
      // Enriquecimento nunca pode derrubar o pedido: falha aqui é engolida.
      const dadosEndereco = dadosPedido.shipping?.id
        ? await buscarRecursoML<{ receiver_address?: {
            receiver_name?: string; street_name?: string; street_number?: string; comment?: string | null;
            neighborhood?: { name?: string | null }; city?: { name?: string | null }; state?: { name?: string | null };
            zip_code?: string; latitude?: number; longitude?: number;
          } }>(`/shipments/${dadosPedido.shipping.id}`, accessToken)
            .then((envio) => envio.receiver_address ?? null)
            .catch(() => null)
        : null;

      return { pedidoML: dadosPedido, endereco: dadosEndereco };
    });

    const pedido = await trace.etapa("database", () => ingerirPedido(conta.orgId, conta.brandId, conta.channelAccountId, {
      providerOrderId: String(pedidoML.id),
      canal: "mercadolivre",
      clienteExternalId: String(pedidoML.buyer.id),
      clienteNome: pedidoML.buyer.nickname,
      clienteEmail: pedidoML.buyer.email,
      clienteEndereco: endereco ? {
        nomeDestinatario: endereco.receiver_name || undefined,
        rua: endereco.street_name || undefined,
        numero: endereco.street_number || undefined,
        complemento: endereco.comment || undefined,
        bairro: endereco.neighborhood?.name || undefined,
        cidade: endereco.city?.name || undefined,
        estado: endereco.state?.name || undefined,
        cep: endereco.zip_code || undefined,
        latitude: endereco.latitude,
        longitude: endereco.longitude,
      } : undefined,
      status: pedidoML.status,
      total: String(pedidoML.total_amount),
      frete: pedidoML.shipping?.cost === undefined ? undefined : String(pedidoML.shipping.cost),
      itens: pedidoML.order_items.map((item) => ({
        skuExterno: item.item.seller_sku ?? "",
        quantidade: item.quantity,
        precoUnitario: String(item.unit_price),
      })),
      criadoEm: new Date(pedidoML.date_created),
    }));
    trace.finalizar("ok");
    return NextResponse.json({ ok: true, ...pedido });
  } catch (error) {
    trace.finalizar("erro", error instanceof Error ? error.message : String(error));
    console.error("[webhook/mercadolivre]", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
