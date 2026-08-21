import { eq, and, or, desc, isNull, like, notLike, inArray, getTableColumns } from "drizzle-orm";
import { db } from "@/shared/lib/db";
import { channelAccount, conversa, mensagem, cliente } from "@/shared/lib/db/schema";
import { clienteIdentidade } from "@/shared/lib/db/schema/clientes";
import { produto, produtoCanal } from "@/shared/lib/db/schema/estoque";
import { despacharEvento, persistirEvento, type PersistedDomainEvent } from "@/shared/events";
import { validarTransicaoConversa, reabrirSeNecessario, type ConversaStatus } from "../domain/state-machine";
import { criarMLProvider } from "@/modules/canais/infrastructure/mercadolivre.provider";
import { brand } from "@/shared/lib/db/schema";
import type { CrudContext } from "@/shared/lib/crud-factory";
import { executarComRetry } from "@/modules/canais/application/retry";
import { isBrandSlug } from "@/shared/config/brands";

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

// A ligação canal+externalId → cliente é criada quando um pedido é
// sincronizado (ingestao-pedido.service). Webhooks de mensagem/pergunta
// consultam essa mesma tabela para exibir o nome do cliente no Inbox em vez
// do ID técnico do comprador.
export async function resolverClientePorIdentidade(orgId: string, canal: string, externalId?: string | number | null): Promise<string | undefined> {
  if (externalId === undefined || externalId === null || externalId === "") return undefined;
  const identidade = await db
    .select({ clienteId: clienteIdentidade.clienteId })
    .from(clienteIdentidade)
    .where(and(
      eq(clienteIdentidade.orgId, orgId),
      eq(clienteIdentidade.canal, canal as never),
      eq(clienteIdentidade.externalId, String(externalId)),
    ))
    .then((r) => r[0]);
  return identidade?.clienteId;
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
      const patch: Partial<typeof conversa.$inferInsert> = {};
      if (novoStatus !== conversaRow.status) patch.status = novoStatus;
      if (!conversaRow.clienteId && input.clienteId) patch.clienteId = input.clienteId;
      // Mesmo sem mudança de status/cliente, a conversa precisa subir para o
      // topo quando recebe uma mensagem nova. Antes updatedAt só mudava ao
      // reabrir a conversa, deixando atendimentos ativos fora de ordem.
      await tx.update(conversa).set({ ...patch, updatedAt: new Date() }).where(and(
        eq(conversa.id, conversaRow.id),
        eq(conversa.orgId, input.orgId),
      ));
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

async function listarContasMercadoLivreConversas(orgId: string, channelAccountId?: string) {
  const condicoes = [
    eq(channelAccount.orgId, orgId),
    eq(channelAccount.tipo, "mercadolivre"),
    eq(channelAccount.status, "conectado"),
  ];
  if (channelAccountId) condicoes.push(eq(channelAccount.id, channelAccountId));

  return db
    .select({
      channelAccountId: channelAccount.id,
      brandId: channelAccount.brandId,
      brandSlug: brand.slug,
    })
    .from(channelAccount)
    .innerJoin(brand, and(eq(brand.id, channelAccount.brandId), eq(brand.orgId, channelAccount.orgId)))
    .where(and(...condicoes));
}

/** Busca ativa das conversas pós-venda dos pedidos recentes de todas as
 *  marcas com Mercado Livre conectado — preenche a aba Conversas sem
 *  depender exclusivamente do webhook, que só reage a eventos a partir do
 *  momento em que passa a estar no ar. Idempotente: reaproveita a mesma
 *  dedupe por providerMessageId do webhook (receberMensagem). */
export async function sincronizarConversasMercadoLivre(orgId: string, diasRetroativos = 90): Promise<{ contasVerificadas: number; mensagensNovas: number; sincronizadoEm: string }> {
  return sincronizarConversasMercadoLivrePorConta(orgId, diasRetroativos);
}

export async function sincronizarConversasMercadoLivreConta(
  orgId: string,
  channelAccountId: string,
  diasRetroativos = 90,
): Promise<{ contasVerificadas: number; mensagensNovas: number; sincronizadoEm: string }> {
  return sincronizarConversasMercadoLivrePorConta(orgId, diasRetroativos, channelAccountId);
}

async function sincronizarConversasMercadoLivrePorConta(
  orgId: string,
  diasRetroativos: number,
  channelAccountId?: string,
): Promise<{ contasVerificadas: number; mensagensNovas: number; sincronizadoEm: string }> {
  const contas = await listarContasMercadoLivreConversas(orgId, channelAccountId);
  const desde = new Date(Date.now() - diasRetroativos * 24 * 60 * 60 * 1000);
  const sincronizadoEm = new Date();
  let mensagensNovas = 0;

  for (const conta of contas) {
    if (!isBrandSlug(conta.brandSlug)) continue;
    try {
      const provider = await criarMLProvider(conta.brandSlug);
      const mensagens = await provider.buscarMensagensPosVendaRecentes(desde);
      console.log(`[inbox] sincronização de conversas: ${conta.brandSlug} retornou ${mensagens.length} mensagem(ns) pós-venda dos últimos ${diasRetroativos} dias`);
      for (const msg of mensagens) {
        if (msg.deVendedor) continue; // mesma regra do webhook: só entrada vira conversa nova
        const antes = await db.select({ id: mensagem.id }).from(mensagem).where(and(
          eq(mensagem.orgId, orgId),
          eq(mensagem.providerMessageId, `ml-message:${msg.providerMessageId}`),
        )).then((r) => r[0]);
        if (antes) continue;
        const clienteId = await resolverClientePorIdentidade(orgId, "mercadolivre", msg.remetenteId ?? undefined);
        await receberMensagem({
          orgId,
          brandId: conta.brandId,
          channelAccountId: conta.channelAccountId,
          clienteId,
          externalConversaId: `ml-pack:${msg.packId}`,
          providerMessageId: `ml-message:${msg.providerMessageId}`,
          conteudo: msg.texto,
          tipo: "texto",
          meta: {
            canal: "mercadolivre",
            topic: "messages",
            remetenteId: msg.remetenteId,
            remetenteNome: clienteId ? undefined : (msg.remetenteNome ?? undefined),
            produtos: msg.produtos.length ? msg.produtos : undefined,
            sellerId: msg.destinatarioId === null ? undefined : String(msg.destinatarioId),
            packId: msg.packId,
            orderId: msg.orderId,
            recebidaEm: msg.criadaEm,
            origem: "sincronizacao-ativa",
          },
        });
        mensagensNovas += 1;
      }
    } catch (error) {
      console.error(`[inbox] sincronização de conversas falhou para ${conta.brandSlug}`, error);
    }
  }

  return { contasVerificadas: contas.length, mensagensNovas, sincronizadoEm: sincronizadoEm.toISOString() };
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
  const conditions = [
    eq(conversa.orgId, orgId),
    // externalId é opcional: em SQL, NULL NOT LIKE '...' resolve para NULL e a
    // linha cairia fora do filtro. Sem externalId a conversa nunca é pergunta.
    or(isNull(conversa.externalId), notLike(conversa.externalId, `%${PERGUNTA_EXTERNAL_ID_MARKER}%`)),
  ];
  if (opts.brandId) conditions.push(eq(conversa.brandId, opts.brandId));
  if (opts.status) conditions.push(eq(conversa.status, opts.status as never));

  const conversas = await db
    .select({
      ...getTableColumns(conversa),
      canalTipo: channelAccount.tipo,
      brandSlug: brand.slug,
      clienteNome: cliente.nome,
      clienteNomeCompleto: cliente.nomeCompleto,
    })
    .from(conversa)
    .leftJoin(channelAccount, eq(conversa.channelAccountId, channelAccount.id))
    .leftJoin(brand, eq(conversa.brandId, brand.id))
    .leftJoin(cliente, eq(conversa.clienteId, cliente.id))
    .where(and(...conditions))
    .orderBy(desc(conversa.updatedAt))
    .limit(opts.limit ?? 50);

  if (conversas.length === 0) return conversas.map((c) => ({
    ...c,
    remetenteNome: undefined as string | undefined,
    produtoResumo: undefined as string | undefined,
    ultimaMensagem: undefined as { conteudo: string; direcao: string; createdAt: Date } | undefined,
  }));

  // Sem cliente vinculado ainda (comprador sem pedido sincronizado), caímos
  // no nome capturado direto do canal na hora da mensagem (ver
  // buscarNomeCompradorML no webhook e buyer.nickname na sincronização ativa).
  const mensagensDaLista = await db
    .select({
      conversaId: mensagem.conversaId,
      direcao: mensagem.direcao,
      conteudo: mensagem.conteudo,
      meta: mensagem.meta,
      createdAt: mensagem.createdAt,
    })
    .from(mensagem)
    .where(and(
      eq(mensagem.orgId, orgId),
      inArray(mensagem.conversaId, conversas.map((c) => c.id)),
    ))
    .orderBy(mensagem.createdAt);
  // Nome do produto no lugar do número de pacote — o título já vem pronto
  // direto do pedido no ML (order_items[].item.title), sem depender de bater
  // com o SKU do nosso Estoque (que pode estar desatualizado ou ausente).
  const nomePorConversa = new Map<string, string>();
  const produtoResumoPorConversa = new Map<string, string>();
  const ultimaMensagemPorConversa = new Map<string, { conteudo: string; direcao: string; createdAt: Date }>();
  for (const m of mensagensDaLista) {
    const meta = m.meta as { remetenteNome?: string; produtos?: string[] } | null;
    if (m.direcao === "entrada" && meta?.remetenteNome) nomePorConversa.set(m.conversaId, meta.remetenteNome);
    if (m.direcao === "entrada" && meta?.produtos?.length) {
      produtoResumoPorConversa.set(
        m.conversaId,
        meta.produtos.length > 1 ? `${meta.produtos[0]} +${meta.produtos.length - 1}` : meta.produtos[0],
      );
    }
    ultimaMensagemPorConversa.set(m.conversaId, {
      conteudo: m.conteudo,
      direcao: m.direcao,
      createdAt: m.createdAt,
    });
  }

  return conversas.map((c) => ({
    ...c,
    remetenteNome: nomePorConversa.get(c.id),
    produtoResumo: produtoResumoPorConversa.get(c.id),
    ultimaMensagem: ultimaMensagemPorConversa.get(c.id),
  }));
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
    .select({ conversa, canalTipo: channelAccount.tipo, brandSlug: brand.slug })
    .from(conversa)
    .innerJoin(channelAccount, and(
      eq(channelAccount.id, conversa.channelAccountId),
      eq(channelAccount.orgId, conversa.orgId),
    ))
    .innerJoin(brand, and(eq(brand.id, conversa.brandId), eq(brand.orgId, conversa.orgId)))
    .where(and(eq(conversa.id, conversaId), eq(conversa.orgId, ctx.orgId)))
    .then((r) => r[0]);
  if (!conversaRow) throw new Error("Conversa não encontrada.");

  if (conversaRow.canalTipo !== "mercadolivre") {
    throw new Error(`Envio pelo canal ${conversaRow.canalTipo} ainda não está habilitado pelo provider oficial.`);
  }
  if (process.env.EXTERNAL_SENDS_ENABLED !== "true") {
    throw new Error("Envios externos desabilitados até a liberação de go-live.");
  }

  if (!isBrandSlug(conversaRow.brandSlug)) throw new Error("Marca Mercado Livre inválida.");
  const ultimaEntrada = await db.select().from(mensagem).where(and(
    eq(mensagem.orgId, ctx.orgId),
    eq(mensagem.conversaId, conversaId),
    eq(mensagem.direcao, "entrada"),
  )).orderBy(desc(mensagem.createdAt)).limit(1).then((rows) => rows[0]);
  const meta = (ultimaEntrada?.meta ?? {}) as Record<string, unknown>;
  const packId = typeof meta.packId === "string" ? meta.packId : null;
  const sellerId = typeof meta.sellerId === "string" ? meta.sellerId : null;
  if (!packId || !sellerId) throw new Error("Conversa sem pack_id/seller_id do Mercado Livre.");

  const provider = await criarMLProvider(conversaRow.brandSlug);
  const { providerMessageId } = await executarComRetry(
    () => provider.enviarMensagemPosVenda({ packId, sellerId, texto: conteudo }),
    { tentativas: 3, atrasoInicialMs: 500 },
  );

  const [novaMensagem] = await db
    .insert(mensagem)
    .values({
      conversaId,
      orgId: ctx.orgId,
      direcao: "saida",
      tipo: "texto",
      conteudo,
      providerMessageId: `ml-message:${providerMessageId}`,
      meta: { canal: "mercadolivre", packId, sellerId, enviadoNaPlataforma: true },
    })
    .returning();

  await db
    .update(conversa)
    .set({
      status: conversaRow.conversa.status === "nova" || conversaRow.conversa.status === "aguardando_cliente"
        ? "em_atendimento"
        : conversaRow.conversa.status,
      updatedAt: new Date(),
    })
    .where(and(eq(conversa.id, conversaId), eq(conversa.orgId, ctx.orgId)));

  return { mensagemId: novaMensagem.id };
}

// Perguntas pré-venda (Q&A de marketplace) usam a mesma tabela conversa/mensagem
// do inbox de chat, marcadas por uma convenção de externalId "<canal>-question:<itemId>"
// definida nos webhooks (ex.: mercadolivre/route.ts topic "questions").
const PERGUNTA_EXTERNAL_ID_MARKER = "-question:";

export async function listarPerguntas(orgId: string, opts: { brandId?: string } = {}) {
  const conditions = [eq(conversa.orgId, orgId), like(conversa.externalId, `%${PERGUNTA_EXTERNAL_ID_MARKER}%`)];
  if (opts.brandId) conditions.push(eq(conversa.brandId, opts.brandId));

  const conversas = await db
    .select({
      id: conversa.id,
      externalId: conversa.externalId,
      status: conversa.status,
      brandId: conversa.brandId,
      brandSlug: brand.slug,
      canalTipo: channelAccount.tipo,
      updatedAt: conversa.updatedAt,
      clienteNome: cliente.nome,
      clienteNomeCompleto: cliente.nomeCompleto,
    })
    .from(conversa)
    .leftJoin(channelAccount, eq(conversa.channelAccountId, channelAccount.id))
    .leftJoin(brand, eq(conversa.brandId, brand.id))
    .leftJoin(cliente, eq(conversa.clienteId, cliente.id))
    .where(and(...conditions))
    .orderBy(desc(conversa.updatedAt))
    .limit(100);

  if (conversas.length === 0) return [];

  const mensagens = await db
    .select()
    .from(mensagem)
    .where(and(eq(mensagem.orgId, orgId), inArray(mensagem.conversaId, conversas.map((c) => c.id))))
    .orderBy(mensagem.createdAt);

  const itemIds = Array.from(new Set(
    mensagens
      .map((m) => (m.meta as { itemId?: string } | null)?.itemId)
      .filter((v): v is string => !!v),
  ));
  const produtos = itemIds.length
    ? await db
        .select({ externalListingId: produtoCanal.externalListingId, nome: produto.nome })
        .from(produtoCanal)
        .innerJoin(produto, eq(produtoCanal.produtoId, produto.id))
        .where(and(eq(produtoCanal.orgId, orgId), inArray(produtoCanal.externalListingId, itemIds)))
    : [];
  const nomeProdutoPorItemId = new Map(produtos.map((p) => [p.externalListingId, p.nome]));

  return conversas.map((c) => {
    const doConversa = mensagens.filter((m) => m.conversaId === c.id);
    const pergunta = doConversa.find((m) => m.direcao === "entrada");
    const resposta = [...doConversa].reverse().find((m) => m.direcao === "saida");
    const meta = (pergunta?.meta ?? {}) as { canal?: string; itemId?: string; remetenteId?: number; remetenteNome?: string };
    const nomeProduto = meta.itemId ? nomeProdutoPorItemId.get(meta.itemId) : undefined;

    return {
      id: c.id,
      status: (resposta ? "respondida" : "pendente") as "pendente" | "respondida",
      canal: meta.canal ?? c.canalTipo ?? "mercadolivre",
      brandSlug: c.brandSlug,
      produto: nomeProduto ?? (meta.itemId ? `Item ${meta.itemId}` : "Item não identificado"),
      cliente: c.clienteNomeCompleto || c.clienteNome || meta.remetenteNome || (meta.remetenteId ? `Comprador #${meta.remetenteId}` : "Comprador"),
      pergunta: pergunta?.conteudo ?? "",
      resposta: resposta?.conteudo,
      criadoEm: pergunta?.createdAt ?? c.updatedAt,
    };
  });
}

export async function responderPergunta(
  ctx: CrudContext,
  conversaId: string,
  conteudo: string,
): Promise<{ mensagemId: string }> {
  const conversaRow = await db
    .select({ conversa, brandSlug: brand.slug })
    .from(conversa)
    .innerJoin(brand, and(eq(brand.id, conversa.brandId), eq(brand.orgId, conversa.orgId)))
    .where(and(eq(conversa.id, conversaId), eq(conversa.orgId, ctx.orgId)))
    .then((r) => r[0]);
  if (!conversaRow) throw new Error("Pergunta não encontrada.");
  if (!conversaRow.conversa.externalId?.includes(PERGUNTA_EXTERNAL_ID_MARKER)) {
    throw new Error("Esta conversa não é uma pergunta de pré-venda de um canal de venda.");
  }

  if (process.env.EXTERNAL_SENDS_ENABLED !== "true") {
    throw new Error("Envios externos desabilitados até a liberação de go-live.");
  }
  if (!isBrandSlug(conversaRow.brandSlug)) throw new Error("Marca Mercado Livre inválida.");
  const pergunta = await db.select().from(mensagem).where(and(
    eq(mensagem.orgId, ctx.orgId),
    eq(mensagem.conversaId, conversaId),
    eq(mensagem.direcao, "entrada"),
  )).orderBy(mensagem.createdAt).limit(1).then((rows) => rows[0]);
  const meta = (pergunta?.meta ?? {}) as Record<string, unknown>;
  const questionId = typeof meta.questionId === "string" ? meta.questionId : null;
  if (!questionId) throw new Error("Pergunta sem question_id do Mercado Livre.");
  const provider = await criarMLProvider(conversaRow.brandSlug);
  const resultado = await executarComRetry(
    () => provider.responderPergunta(questionId, conteudo),
    { tentativas: 3, atrasoInicialMs: 500 },
  );
  const [novaMensagem] = await db
    .insert(mensagem)
    .values({
      conversaId,
      orgId: ctx.orgId,
      direcao: "saida",
      tipo: "texto",
      conteudo,
      providerMessageId: `ml-answer:${resultado.questionId}`,
      meta: { canal: "mercadolivre", questionId, statusExterno: resultado.status, enviadoNaPlataforma: true },
    })
    .returning();

  await db
    .update(conversa)
    .set({ status: "resolvida", updatedAt: new Date() })
    .where(and(eq(conversa.id, conversaId), eq(conversa.orgId, ctx.orgId)));

  return { mensagemId: novaMensagem.id };
}
