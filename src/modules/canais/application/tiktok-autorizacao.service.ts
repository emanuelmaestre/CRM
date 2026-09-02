import { and, eq } from "drizzle-orm";
import { createClient } from "@supabase/supabase-js";
import { db } from "@/shared/lib/db";
import { auditLog, brand, channelAccount } from "@/shared/lib/db/schema";
import { brandEnvSuffix } from "@/shared/config/brands";
import { emitirEvento } from "@/shared/events";
import { CANAL_TOKEN_TIKTOK } from "./tiktok-token.service";

/* ── Fim da autorização do vendedor (webhooks Tipo 6 e Tipo 7) ───────────
 *
 *  Os dois já estavam assinados no Partner Center e chegavam à rota, onde
 *  caíam no descarte por não trazerem `order_id`. O TikTok considerava
 *  entregue, o CRM não registrava nada, e a única pista de que a loja tinha
 *  saído do ar era a importação parar de trazer pedido.
 *
 *  Tipo 6 (desautorização) é definitivo: o vendedor removeu o app. O token
 *  ainda existe no banco mas já não vale nada, e mantê-lo lá faria o A36
 *  gastar hora em hora tentando renovar credencial de uma loja que não
 *  autoriza mais. A conta vira `desconectado` e a linha de token sai.
 *
 *  Tipo 7 (expiração da autorização) é aviso: a autorização vence, mas ainda
 *  vale. Derrubar a conta aqui apagaria dado bom antes da hora — o correto é
 *  `degradado`, que é como o resto do sistema já diz "funciona, mas alguém
 *  precisa olhar". O token fica onde está.
 *
 *  Nada aqui toca no Tipo 1. */

/** Resolve a conta TikTok a partir do identificador de loja do webhook.
 *
 *  Resolver próprio, e não `resolverContaWebhookMarketplace`, porque aquele é
 *  compartilhado com Mercado Livre e Shopee e compara contra UM identificador
 *  só: `meta.externalAccountId`, caindo no env apenas quando o meta está
 *  vazio. Na conta TikTok o `externalAccountId` gravado pelo callback é o
 *  `open_id` do vendedor (`UDMnDAAAAAB...`), que não é o que o webhook manda —
 *  então o env com o código da loja, que casaria, nunca chegava a ser
 *  consultado. Aqui os identificadores conhecidos são todos aceitos, sem
 *  precisar mexer no resolvedor dos outros dois canais. */
export async function resolverContaTikTokPorLoja(identificadorLoja: string): Promise<{
  orgId: string;
  brandId: string;
  brandSlug: string;
  channelAccountId: string;
} | null> {
  const orgId = process.env.DEFAULT_ORG_ID;
  if (!orgId) return null;

  const contas = await db
    .select({
      orgId: channelAccount.orgId,
      brandId: channelAccount.brandId,
      brandSlug: brand.slug,
      channelAccountId: channelAccount.id,
      meta: channelAccount.meta,
    })
    .from(channelAccount)
    .innerJoin(brand, and(
      eq(brand.id, channelAccount.brandId),
      eq(brand.orgId, channelAccount.orgId),
    ))
    .where(and(
      eq(channelAccount.orgId, orgId),
      eq(channelAccount.tipo, "tiktokshop"),
    ));

  const alvo = identificadorLoja.trim();
  for (const conta of contas) {
    const meta = conta.meta as Record<string, unknown> | null;
    const candidatos = [
      typeof meta?.externalAccountId === "string" ? meta.externalAccountId : undefined,
      typeof meta?.shopId === "string" ? meta.shopId : undefined,
      typeof meta?.shopCode === "string" ? meta.shopCode : undefined,
      process.env[`TIKTOK_SHOP_ID_${brandEnvSuffix(conta.brandSlug)}`],
    ];
    if (candidatos.some((valor) => valor?.trim() === alvo)) {
      return {
        orgId: conta.orgId,
        brandId: conta.brandId,
        brandSlug: conta.brandSlug,
        channelAccountId: conta.channelAccountId,
      };
    }
  }
  return null;
}

async function registrarMudanca(input: {
  conta: { orgId: string; brandId: string; channelAccountId: string };
  status: "degradado" | "desconectado";
  motivo: string;
  acao: string;
  detalhe: Record<string, unknown>;
}): Promise<void> {
  const anterior = await db
    .select({ status: channelAccount.status })
    .from(channelAccount)
    .where(eq(channelAccount.id, input.conta.channelAccountId))
    .then((rows) => rows[0]);

  const agora = new Date();
  await db
    .update(channelAccount)
    .set({
      status: input.status,
      ultimoErro: input.motivo,
      ultimaVerificacao: agora,
      updatedAt: agora,
    })
    .where(eq(channelAccount.id, input.conta.channelAccountId));

  await db.insert(auditLog).values({
    orgId: input.conta.orgId,
    brandId: input.conta.brandId,
    autorTipo: "sistema",
    entidade: "channel_account",
    entidadeId: input.conta.channelAccountId,
    acao: input.acao,
    antes: { status: anterior?.status ?? null },
    depois: { status: input.status, motivo: input.motivo, ...input.detalhe },
  });

  await emitirEvento({
    tipo: input.status === "desconectado" ? "canal.desconectado" : "canal.degradado",
    orgId: input.conta.orgId,
    brandId: input.conta.brandId,
    entidade: "channel_account",
    entidadeId: input.conta.channelAccountId,
    payload: { tipo: "tiktokshop", motivo: input.motivo, ...input.detalhe },
  });
}

/** Tipo 6 — o vendedor desautorizou o app. */
export async function tratarDesautorizacaoTikTok(
  conta: { orgId: string; brandId: string; channelAccountId: string },
  detalhe: Record<string, unknown> = {},
): Promise<{ tokensRemovidos: number }> {
  await registrarMudanca({
    conta,
    status: "desconectado",
    motivo: "TikTok Shop: o vendedor desautorizou o aplicativo. É preciso conectar de novo em Configurações.",
    acao: "webhook_desautorizacao",
    detalhe: { webhookTipo: 6, ...detalhe },
  });

  // O token sai pelo mesmo cliente Supabase que o resto do canal_tokens usa —
  // a tabela não está no schema drizzle.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return { tokensRemovidos: 0 };

  const { data, error } = await createClient(supabaseUrl, serviceRoleKey)
    .from("canal_tokens")
    .delete()
    .eq("org_id", conta.orgId)
    .eq("brand_id", conta.brandId)
    .eq("canal", CANAL_TOKEN_TIKTOK)
    .select("id");

  // Token que não saiu não invalida o que já foi registrado: a conta já está
  // marcada como desconectada, que é o que as telas leem.
  if (error) {
    console.error("[tiktok-autorizacao] falha ao remover token desautorizado", error);
    return { tokensRemovidos: 0 };
  }
  return { tokensRemovidos: data?.length ?? 0 };
}

/** Tipo 7 — a autorização vai expirar; ainda vale até lá. */
export async function tratarExpiracaoAutorizacaoTikTok(
  conta: { orgId: string; brandId: string; channelAccountId: string },
  detalhe: Record<string, unknown> = {},
): Promise<void> {
  await registrarMudanca({
    conta,
    status: "degradado",
    motivo: "TikTok Shop: a autorização do vendedor está expirando. Reconecte em Configurações antes do vencimento.",
    acao: "webhook_expiracao_autorizacao",
    detalhe: { webhookTipo: 7, ...detalhe },
  });
}
