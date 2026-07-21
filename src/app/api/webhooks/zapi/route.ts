import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { receberMensagem } from "@/modules/inbox/application/inbox.service";

const ZApiWebhookSchema = z.object({
  instanceId: z.string(),
  messageId: z.string(),
  phone: z.string(),
  body: z.string(),
  type: z.string().default("text"),
  momment: z.number().optional(),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  const assinatura = req.headers.get("x-api-token");
  const tokenEsperado = process.env.ZAPI_WEBHOOK_TOKEN;

  if (tokenEsperado && assinatura !== tokenEsperado) {
    return NextResponse.json({ error: "Assinatura inválida" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
  }

  const resultado = ZApiWebhookSchema.safeParse(body);
  if (!resultado.success) {
    return NextResponse.json({ error: "Schema inválido", detalhes: resultado.error.flatten() }, { status: 422 });
  }

  const dados = resultado.data;

  const orgId = process.env.DEFAULT_ORG_ID ?? "";
  const brandId = process.env.DEFAULT_BRAND_ID ?? "";
  const channelAccountId = process.env.DEFAULT_CHANNEL_ACCOUNT_ID ?? "";

  try {
    const { conversaId, mensagemId } = await receberMensagem({
      orgId,
      brandId,
      channelAccountId,
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
