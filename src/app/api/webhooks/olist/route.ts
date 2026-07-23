import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ingerirPedido } from "@/modules/canais/application/ingestao-pedido.service";
import { resolverContaWebhookMarketplace } from "@/modules/canais/application/webhook-account.service";
import { criarOlistProvider } from "@/modules/canais/infrastructure/olist.provider";
import { verificarRateLimit } from "@/shared/lib/rate-limit";

const MAX_WEBHOOK_BYTES = 1_048_576;

const OlistOfficialWebhookSchema = z.object({
  received_at: z.iso.datetime(),
  resource: z.string().regex(/^\/seller-orders\/[A-Za-z0-9_-]+\/$/),
  sent_at: z.string().min(1),
  topic: z.literal("orders"),
  seller_id: z.string().min(1),
});

// Compatibilidade temporária com o webhook legado do Olist ERP.
const OlistLegacyWebhookSchema = z.object({
  event: z.string(),
  data: z.object({
    order_number: z.string(),
    store_id: z.string().optional(),
    status: z.string().optional(),
    total_amount: z.number().optional(),
    freight_amount: z.number().optional(),
    customer: z.object({
      name: z.string(),
      email: z.string().optional(),
      phone: z.string().optional(),
    }).optional(),
    created_at: z.string().optional(),
    items: z.array(z.object({
      seller_sku: z.string(),
      quantity: z.number(),
      unit_price: z.number(),
    })).optional(),
  }),
});

function verificarAssinaturaLegada(req: NextRequest, rawBody: string): boolean {
  const secret = process.env.OLIST_WEBHOOK_SECRET;
  const assinatura = req.headers.get("x-olist-signature") ?? "";
  if (!secret || !/^[a-f0-9]{40}$/i.test(assinatura)) return false;
  const esperado = crypto.createHmac("sha1", secret).update(rawBody).digest("hex");
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

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
  }

  const official = OlistOfficialWebhookSchema.safeParse(body);
  if (official.success) {
    try {
      // O payload oficial não contém dados comerciais nem assinatura. A origem
      // é validada ao consultar o resource na API autenticada antes de gravar.
      const conta = await resolverContaWebhookMarketplace("olist", official.data.seller_id);
      const provider = criarOlistProvider(conta.brandSlug);
      const pedido = await provider.buscarPedidoPorResource(official.data.resource);
      if (!pedido || pedido.itens.length === 0) {
        throw new Error("Olist retornou pedido sem itens mapeáveis.");
      }
      const resultado = await ingerirPedido(
        conta.orgId,
        conta.brandId,
        conta.channelAccountId,
        pedido,
      );
      return NextResponse.json({ ok: true, ...resultado }, { status: 201 });
    } catch (error) {
      console.error("[webhook/olist/official]", error);
      return NextResponse.json({ error: "Erro interno" }, { status: 500 });
    }
  }

  const legacy = OlistLegacyWebhookSchema.safeParse(body);
  if (!legacy.success) {
    return NextResponse.json({ error: "Schema inválido" }, { status: 422 });
  }
  if (!verificarAssinaturaLegada(req, rawBody)) {
    return NextResponse.json({ error: "Assinatura inválida" }, { status: 401 });
  }
  if (!legacy.data.event.startsWith("order.")) {
    return NextResponse.json({ ok: true, ignorado: true, event: legacy.data.event });
  }

  const { data } = legacy.data;
  const itens = (data.items ?? []).map((item) => ({
    skuExterno: item.seller_sku,
    quantidade: item.quantity,
    precoUnitario: String(item.unit_price),
  }));
  if (itens.length === 0) {
    return NextResponse.json({ ok: true, ignorado: true, motivo: "sem-itens" });
  }

  try {
    const storeId = data.store_id ?? process.env.OLIST_SHOP_ID_KARZI ?? "";
    const conta = await resolverContaWebhookMarketplace("olist", storeId);
    const resultado = await ingerirPedido(conta.orgId, conta.brandId, conta.channelAccountId, {
      providerOrderId: data.order_number,
      canal: "olist",
      clienteExternalId: data.customer?.email ?? data.order_number,
      clienteNome: data.customer?.name ?? "Cliente Olist",
      clienteEmail: data.customer?.email,
      clienteTelefone: data.customer?.phone,
      status: data.status ?? "criado",
      total: data.total_amount === undefined ? "0" : String(data.total_amount),
      frete: data.freight_amount === undefined ? undefined : String(data.freight_amount),
      itens,
      criadoEm: data.created_at ? new Date(data.created_at) : new Date(),
    });
    return NextResponse.json({ ok: true, ...resultado });
  } catch (error) {
    console.error("[webhook/olist/legacy]", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
