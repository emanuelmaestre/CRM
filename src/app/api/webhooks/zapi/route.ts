import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { receberMensagem } from "@/modules/inbox/application/inbox.service";
import { db } from "@/shared/lib/db";
import { brand, channelAccount } from "@/shared/lib/db/schema";
import { verificarRateLimit } from "@/shared/lib/rate-limit";
import { brandEnvSuffix, isBrandSlug } from "@/shared/config/brands";

const ZApiWebhookSchema = z.object({
  instanceId: z.string(),
  messageId: z.string(),
  phone: z.string(),
  body: z.string(),
  type: z.string().default("text"),
  momment: z.number().optional(),
});

const ContaWebhookSchema = z.object({
  orgId: z.uuid(),
  brandId: z.uuid(),
  instanceId: z.string().min(1),
  webhookToken: z.string().min(16),
});

function compararSegredo(recebido: string, esperado: string): boolean {
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function resolverConta(instanceId: string) {
  const orgId = process.env.DEFAULT_ORG_ID;
  if (!orgId) return undefined;
  const marcas = await db.select({ id: brand.id, slug: brand.slug }).from(brand).where(and(
    eq(brand.orgId, orgId),
    eq(brand.active, true),
  ));
  const candidatas = marcas.filter((marca) => isBrandSlug(marca.slug)).map((marca) => {
    const suffix = brandEnvSuffix(marca.slug);
    return ContaWebhookSchema.safeParse({
      orgId,
      brandId: marca.id,
      instanceId: process.env[`ZAPI_INSTANCE_${suffix}`],
      webhookToken: process.env[`ZAPI_WEBHOOK_TOKEN_${suffix}`],
    });
  }).filter((resultado) => resultado.success).map((resultado) => resultado.data);

  return candidatas.find((conta) => conta.instanceId === instanceId);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const bloqueio = await verificarRateLimit(req, "webhook");
  if (bloqueio) return bloqueio;

  const assinatura = req.headers.get("x-api-token");
  if (!assinatura) {
    return NextResponse.json({ error: "Assinatura inválida" }, { status: 401 });
  }

  let body: unknown;
  try {
    const rawBody = await req.text();
    if (rawBody.length > 1_000_000) {
      return NextResponse.json({ error: "Payload excede o limite permitido" }, { status: 413 });
    }
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
  }

  const identificacao = z.object({ instanceId: z.string().min(1) }).safeParse(body);
  if (!identificacao.success) {
    return NextResponse.json({ error: "Assinatura inválida" }, { status: 401 });
  }

  const configuracao = await resolverConta(identificacao.data.instanceId);
  if (!configuracao || !compararSegredo(assinatura, configuracao.webhookToken)) {
    return NextResponse.json({ error: "Assinatura inválida" }, { status: 401 });
  }

  const resultado = ZApiWebhookSchema.safeParse(body);
  if (!resultado.success) {
    return NextResponse.json({ error: "Schema inválido", detalhes: resultado.error.flatten() }, { status: 422 });
  }
  const dados = resultado.data;

  try {
    const conta = await db.select({ id: channelAccount.id }).from(channelAccount).where(and(
      eq(channelAccount.orgId, configuracao.orgId),
      eq(channelAccount.brandId, configuracao.brandId),
      eq(channelAccount.tipo, "whatsapp"),
    )).then((rows) => rows[0]);
    if (!conta) {
      return NextResponse.json({ error: "Conta de WhatsApp não provisionada" }, { status: 503 });
    }

    const { conversaId, mensagemId } = await receberMensagem({
      orgId: configuracao.orgId,
      brandId: configuracao.brandId,
      channelAccountId: conta.id,
      externalConversaId: dados.phone,
      providerMessageId: dados.messageId,
      conteudo: dados.body,
      tipo: dados.type,
      meta: { instanceId: dados.instanceId, phone: dados.phone },
    });

    return NextResponse.json({ ok: true, conversaId, mensagemId });
  } catch (err) {
    console.error("[webhook/zapi]", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
