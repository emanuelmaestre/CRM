import { eq, and, desc } from "drizzle-orm";
import { db } from "@/shared/lib/db";
import { conversa, mensagem } from "@/shared/lib/db/schema";
import { emitirEvento } from "@/shared/events";
import { validarTransicaoConversa, reabrirSeNecessario, type ConversaStatus } from "../domain/state-machine";
import type { CrudContext } from "@/shared/lib/crud-factory";

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
    .where(eq(mensagem.providerMessageId, input.providerMessageId))
    .then((r) => r[0]);

  if (msgExistente) return { conversaId: msgExistente.conversaId, mensagemId: msgExistente.id };

  let conversaRow = input.externalConversaId
    ? await db.select().from(conversa).where(eq(conversa.externalId, input.externalConversaId)).then((r) => r[0])
    : null;

  if (conversaRow) {
    const novoStatus = reabrirSeNecessario(conversaRow.status as ConversaStatus);
    if (novoStatus !== conversaRow.status) {
      await db.update(conversa).set({ status: novoStatus, updatedAt: new Date() }).where(eq(conversa.id, conversaRow.id));
    }
  } else {
    const [nova] = await db.insert(conversa).values({
      orgId: input.orgId,
      brandId: input.brandId,
      clienteId: input.clienteId,
      channelAccountId: input.channelAccountId,
      externalId: input.externalConversaId,
      status: "nova",
    }).returning();
    conversaRow = nova;
  }

  const [novaMensagem] = await db.insert(mensagem).values({
    conversaId: conversaRow.id,
    orgId: input.orgId,
    direcao: "entrada",
    tipo: input.tipo ?? "texto",
    conteudo: input.conteudo,
    providerMessageId: input.providerMessageId,
    meta: input.meta,
  }).returning();

  await emitirEvento({
    tipo: "conversa.recebida",
    orgId: input.orgId,
    brandId: input.brandId,
    entidade: "conversa",
    entidadeId: conversaRow.id,
    payload: { mensagemId: novaMensagem.id, canal: input.channelAccountId },
  });

  return { conversaId: conversaRow.id, mensagemId: novaMensagem.id };
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
    .where(eq(conversa.id, conversaId));
}

export async function listarConversas(orgId: string, opts: { brandId?: string; status?: string; limit?: number } = {}) {
  const conditions = [eq(conversa.orgId, orgId)];
  if (opts.brandId) conditions.push(eq(conversa.brandId, opts.brandId));
  if (opts.status) conditions.push(eq(conversa.status, opts.status as never));

  return db
    .select()
    .from(conversa)
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
