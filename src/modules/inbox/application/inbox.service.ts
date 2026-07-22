import { eq, and, desc, getTableColumns } from "drizzle-orm";
import { db } from "@/shared/lib/db";
import { channelAccount, conversa, mensagem } from "@/shared/lib/db/schema";
import { despacharEvento, persistirEvento, type PersistedDomainEvent } from "@/shared/events";
import { validarTransicaoConversa, reabrirSeNecessario, type ConversaStatus } from "../domain/state-machine";
import { criarZApiProvider } from "@/modules/canais/infrastructure/zapi.provider";
import { brand } from "@/shared/lib/db/schema";
import type { CrudContext } from "@/shared/lib/crud-factory";

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

export async function receberMensagem(input: {
  orgId: string;
  brandId: string;
  channelAccountId: string;
  clienteId?: string;
  externalConversaId?: string;
  providerMessageId: string;
  conteudo: string;
  tipo?: string;
  meta?: Record<string, unknown>;
}): Promise<{ conversaId: string; mensagemId: string }> {
  const msgExistente = await db
    .select()
    .from(mensagem)
    .where(and(
      eq(mensagem.orgId, input.orgId),
      eq(mensagem.providerMessageId, input.providerMessageId),
    ))
    .then((r) => r[0]);

  if (msgExistente) return { conversaId: msgExistente.conversaId, mensagemId: msgExistente.id };

  let resultado: { conversaId: string; mensagemId: string; evento: PersistedDomainEvent };
  try {
    resultado = await db.transaction(async (tx) => {
    const contaValida = await tx.select({ id: channelAccount.id }).from(channelAccount).where(and(
      eq(channelAccount.id, input.channelAccountId),
      eq(channelAccount.orgId, input.orgId),
      eq(channelAccount.brandId, input.brandId),
      eq(channelAccount.tipo, "whatsapp"),
    )).then((rows) => rows[0]);
    if (!contaValida) throw new Error("Conta de canal não pertence à organização e marca informadas.");

    let conversaRow = input.externalConversaId
      ? await tx.select().from(conversa).where(and(
          eq(conversa.orgId, input.orgId),
          eq(conversa.brandId, input.brandId),
          eq(conversa.channelAccountId, input.channelAccountId),
          eq(conversa.externalId, input.externalConversaId),
        )).then((rows) => rows[0])
      : null;

    if (conversaRow) {
      const novoStatus = reabrirSeNecessario(conversaRow.status as ConversaStatus);
      if (novoStatus !== conversaRow.status) {
        await tx.update(conversa).set({ status: novoStatus, updatedAt: new Date() }).where(and(
          eq(conversa.id, conversaRow.id),
          eq(conversa.orgId, input.orgId),
        ));
      }
    } else {
      const [nova] = await tx.insert(conversa).values({
        orgId: input.orgId,
        brandId: input.brandId,
        clienteId: input.clienteId,
        channelAccountId: input.channelAccountId,
        externalId: input.externalConversaId,
        status: "nova",
      }).returning();
      conversaRow = nova;
    }

    const [novaMensagem] = await tx.insert(mensagem).values({
      conversaId: conversaRow.id,
      orgId: input.orgId,
      direcao: "entrada",
      tipo: input.tipo ?? "texto",
      conteudo: input.conteudo,
      providerMessageId: input.providerMessageId,
      meta: input.meta,
    }).returning();

    const evento = await persistirEvento({
      tipo: "conversa.recebida",
      orgId: input.orgId,
      brandId: input.brandId,
      entidade: "conversa",
      entidadeId: conversaRow.id,
      payload: { mensagemId: novaMensagem.id, canal: input.channelAccountId },
    }, tx);

    return { conversaId: conversaRow.id, mensagemId: novaMensagem.id, evento };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      const duplicada = await db.select().from(mensagem).where(and(
        eq(mensagem.orgId, input.orgId),
        eq(mensagem.providerMessageId, input.providerMessageId),
      )).then((rows) => rows[0]);
      if (duplicada) return { conversaId: duplicada.conversaId, mensagemId: duplicada.id };
    }
    throw error;
  }

  await despacharEvento(resultado.evento);
  return { conversaId: resultado.conversaId, mensagemId: resultado.mensagemId };
}

export async function avancarStatusConversa(
  ctx: CrudContext,
  conversaId: string,
  novoStatus: ConversaStatus
): Promise<void> {
  const conversaRow = await db
    .select()
    .from(conversa)
    .where(and(eq(conversa.id, conversaId), eq(conversa.orgId, ctx.orgId)))
    .then((r) => r[0]);

  if (!conversaRow) throw new Error("Conversa não encontrada.");

  validarTransicaoConversa(conversaRow.status as ConversaStatus, novoStatus);

  await db.update(conversa)
    .set({ status: novoStatus, updatedAt: new Date() })
    .where(and(eq(conversa.id, conversaId), eq(conversa.orgId, ctx.orgId)));
}

export async function listarConversas(orgId: string, opts: { brandId?: string; status?: string; limit?: number } = {}) {
  const conditions = [eq(conversa.orgId, orgId)];
  if (opts.brandId) conditions.push(eq(conversa.brandId, opts.brandId));
  if (opts.status) conditions.push(eq(conversa.status, opts.status as never));

  return db
    .select({
      ...getTableColumns(conversa),
      canalTipo: channelAccount.tipo,
      brandSlug: brand.slug,
    })
    .from(conversa)
    .leftJoin(channelAccount, eq(conversa.channelAccountId, channelAccount.id))
    .leftJoin(brand, eq(conversa.brandId, brand.id))
    .where(and(...conditions))
    .orderBy(desc(conversa.updatedAt))
    .limit(opts.limit ?? 50);
}

export async function listarMensagens(orgId: string, conversaId: string) {
  return db
    .select()
    .from(mensagem)
    .where(and(eq(mensagem.conversaId, conversaId), eq(mensagem.orgId, orgId)))
    .orderBy(desc(mensagem.createdAt));
}

export async function enviarMensagem(
  ctx: CrudContext,
  conversaId: string,
  conteudo: string
): Promise<{ mensagemId: string }> {
  const conversaRow = await db
    .select()
    .from(conversa)
    .where(and(eq(conversa.id, conversaId), eq(conversa.orgId, ctx.orgId)))
    .then((r) => r[0]);
  if (!conversaRow) throw new Error("Conversa não encontrada.");

  const brandRow = await db
    .select({ slug: brand.slug })
    .from(brand)
    .where(eq(brand.id, conversaRow.brandId))
    .then((r) => r[0]);
  if (!brandRow) throw new Error("Marca não encontrada.");

  const slug = brandRow.slug as "karzi" | "wuwu";
  const provider = criarZApiProvider(slug);

  const telefone = conversaRow.externalId ?? "";
  if (!telefone) throw new Error("Conversa sem telefone de destino.");

  const { providerMessageId } = await provider.enviarMensagem({ para: telefone, conteudo });

  const [novaMensagem] = await db
    .insert(mensagem)
    .values({
      conversaId,
      orgId: ctx.orgId,
      direcao: "saida",
      tipo: "texto",
      conteudo,
      providerMessageId,
    })
    .returning();

  if (conversaRow.status === "nova" || conversaRow.status === "aguardando_cliente") {
    await db
      .update(conversa)
      .set({ status: "em_atendimento", updatedAt: new Date() })
      .where(and(eq(conversa.id, conversaId), eq(conversa.orgId, ctx.orgId)));
  }

  return { mensagemId: novaMensagem.id };
}
