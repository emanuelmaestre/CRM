import { eq, and, or, isNull, ilike, ne, desc } from "drizzle-orm";
import { z } from "zod";
import { assertPerfil, createCrudFactory, type CrudContext } from "@/shared/lib/crud-factory";
import { db } from "@/shared/lib/db";
import {
  auditLog, brand, cliente, clienteTag, consentimento, interacao, pedido, scoreCliente, tag, tarefa,
} from "@/shared/lib/db/schema";
import { emitirEvento } from "@/shared/events";
import {
  CreateClienteSchema, UpdateClienteSchema, CriarAnotacaoSchema, TIPO_INTERACAO_ANOTACAO,
  type CreateClienteDTO, type UpdateClienteDTO, type CriarAnotacaoDTO,
} from "../domain/entities";
import {
  normalizarTelefone, normalizarEmail, normalizarCpfCnpj,
  calcularScoreDeduplicacao, classificarDeduplicacao,
} from "../domain/identity";

const crudCliente = createCrudFactory({
  table: cliente,
  entityName: "cliente",
  softDelete: true,
  allowedPerfis: {
    create: ["admin", "gestor", "vendedor"],
    update: ["admin", "gestor", "vendedor"],
    delete: ["admin", "gestor"],
    read: ["admin", "gestor", "vendedor"],
  },
});

export async function criarCliente(ctx: CrudContext, input: CreateClienteDTO) {
  const data = CreateClienteSchema.parse({
    ...input,
    telefone: input.telefone ? normalizarTelefone(input.telefone) : input.telefone,
    email: input.email ? normalizarEmail(input.email) : input.email,
    cpfCnpj: input.cpfCnpj ? normalizarCpfCnpj(input.cpfCnpj) : input.cpfCnpj,
  });

  const dedup = await verificarDeduplicacao(ctx.orgId, {
    telefone: data.telefone,
    email: data.email,
    cpfCnpj: data.cpfCnpj,
  });

  if (dedup.tipo === "exato") {
    throw new Error(`Cliente duplicado detectado: ID ${dedup.clienteIdExistente}`);
  }

  const novo = await crudCliente.create(ctx, data);

  await emitirEvento({
    tipo: "cliente.criado",
    orgId: ctx.orgId,
    entidade: "cliente",
    entidadeId: (novo as { id: string }).id,
    payload: novo,
  });

  return { cliente: novo, possiveisDuplicados: dedup.tipo === "possivel" ? [dedup] : [] };
}

export async function buscarClientePorId(ctx: CrudContext, id: string) {
  return crudCliente.getById(ctx, id);
}

export async function buscarCliente360(ctx: CrudContext, id: string) {
  const clienteAtual = await crudCliente.getById(ctx, id) as typeof cliente.$inferSelect | null;
  if (!clienteAtual) throw new Error("Cliente não encontrado.");

  const [interacoes, pedidos, tarefasCliente, consentimentos, tagsCliente, scoreRow] = await Promise.all([
    ctx.db
      .select()
      .from(interacao)
      .where(and(eq(interacao.orgId, ctx.orgId), eq(interacao.clienteId, id)))
      .orderBy(desc(interacao.createdAt))
      .limit(50),
    ctx.db
      .select()
      .from(pedido)
      .where(and(eq(pedido.orgId, ctx.orgId), eq(pedido.clienteId, id)))
      .orderBy(desc(pedido.createdAt))
      .limit(50),
    ctx.db
      .select()
      .from(tarefa)
      .where(and(eq(tarefa.orgId, ctx.orgId), eq(tarefa.clienteId, id)))
      .orderBy(desc(tarefa.createdAt))
      .limit(50),
    ctx.db
      .select()
      .from(consentimento)
      .where(and(eq(consentimento.orgId, ctx.orgId), eq(consentimento.clienteId, id)))
      .orderBy(desc(consentimento.createdAt)),
    ctx.db
      .select({ id: tag.id, nome: tag.nome, cor: tag.cor })
      .from(clienteTag)
      .innerJoin(tag, eq(tag.id, clienteTag.tagId))
      .where(and(eq(tag.orgId, ctx.orgId), eq(clienteTag.clienteId, id))),
    ctx.db
      .select({
        churnRisk: scoreCliente.churnRisk,
        segmento: scoreCliente.segmento,
        acaoSugerida: scoreCliente.acaoSugerida,
        proximaCompraEstimada: scoreCliente.proximaCompraEstimada,
        calculadoEm: scoreCliente.calculadoEm,
      })
      .from(scoreCliente)
      .where(and(eq(scoreCliente.orgId, ctx.orgId), eq(scoreCliente.clienteId, id)))
      .then((rows) => rows[0] ?? null),
  ]);

  const anotacoes = interacoes.filter((item) => item.tipo === TIPO_INTERACAO_ANOTACAO);
  const timelineInteracoes = interacoes.filter((item) => item.tipo !== TIPO_INTERACAO_ANOTACAO);

  return {
    cliente: clienteAtual,
    interacoes: timelineInteracoes,
    anotacoes,
    pedidos,
    tarefas: tarefasCliente,
    consentimentos,
    tags: tagsCliente,
    score: scoreRow,
  };
}

export async function criarAnotacaoCliente(ctx: CrudContext, input: CriarAnotacaoDTO) {
  const data = CriarAnotacaoSchema.parse(input);

  const clienteValido = await ctx.db.select({ id: cliente.id }).from(cliente).where(and(
    eq(cliente.id, data.clienteId), eq(cliente.orgId, ctx.orgId), isNull(cliente.deletedAt),
  )).then((rows) => rows[0]);
  if (!clienteValido) throw new Error("Cliente não encontrado.");

  const [nova] = await ctx.db.insert(interacao).values({
    clienteId: data.clienteId,
    orgId: ctx.orgId,
    tipo: TIPO_INTERACAO_ANOTACAO,
    resumo: data.texto,
    autorId: ctx.userId,
  }).returning();

  await ctx.db.insert(auditLog).values({
    orgId: ctx.orgId,
    autorId: ctx.userId,
    autorTipo: ctx.userId ? "usuario" : "sistema",
    entidade: "interacao",
    entidadeId: nova.id,
    acao: "create",
    depois: nova,
  });

  await emitirEvento({
    tipo: "cliente.anotacao_registrada",
    orgId: ctx.orgId,
    entidade: "cliente",
    entidadeId: data.clienteId,
    payload: { interacaoId: nova.id },
  });

  return nova;
}

export async function exportarDadosCliente(ctx: CrudContext, id: string) {
  assertPerfil(ctx, ["admin", "gestor"]);
  const data = await buscarCliente360(ctx, id);

  await ctx.db.insert(auditLog).values({
    orgId: ctx.orgId,
    autorId: ctx.userId,
    autorTipo: ctx.userId ? "usuario" : "sistema",
    entidade: "cliente",
    entidadeId: id,
    acao: "lgpd_exportacao",
    depois: { clienteId: id, geradoEm: new Date().toISOString() },
  });

  return {
    tipo: "lgpd_exportacao_cliente",
    geradoEm: new Date().toISOString(),
    orgId: ctx.orgId,
    dados: data,
  };
}

export async function listarClientes(
  ctx: CrudContext,
  opts: { busca?: string; limit?: number; offset?: number } = {}
) {
  const filters = [];

  if (opts.busca) {
    filters.push(
      or(
        ilike(cliente.nome, `%${opts.busca}%`),
        ilike(cliente.email, `%${opts.busca}%`),
        ilike(cliente.telefone, `%${opts.busca}%`)
      )!
    );
  }

  return crudCliente.list(ctx, {
    limit: opts.limit,
    offset: opts.offset,
    filters,
  });
}

export async function atualizarCliente(ctx: CrudContext, id: string, input: UpdateClienteDTO) {
  const data = UpdateClienteSchema.parse({
    ...input,
    telefone: input.telefone ? normalizarTelefone(input.telefone) : input.telefone,
    email: input.email ? normalizarEmail(input.email) : input.email,
    cpfCnpj: input.cpfCnpj ? normalizarCpfCnpj(input.cpfCnpj) : input.cpfCnpj,
  });

  const dedup = await verificarDeduplicacao(ctx.orgId, {
    telefone: data.telefone,
    email: data.email,
    cpfCnpj: data.cpfCnpj,
  }, id);
  if (dedup.tipo === "exato") {
    throw new Error(`Cliente duplicado detectado: ID ${dedup.clienteIdExistente}`);
  }

  const atualizado = await crudCliente.update(ctx, id, data);
  await emitirEvento({
    tipo: "cliente.atualizado",
    orgId: ctx.orgId,
    entidade: "cliente",
    entidadeId: id,
    payload: { campos: Object.keys(data) },
  });
  return atualizado;
}

export async function arquivarCliente(ctx: CrudContext, id: string) {
  const arquivado = await crudCliente.softDeleteById(ctx, id);
  await emitirEvento({
    tipo: "cliente.arquivado",
    orgId: ctx.orgId,
    entidade: "cliente",
    entidadeId: id,
    payload: { arquivado: true },
  });
  return arquivado;
}

async function verificarDeduplicacao(
  orgId: string,
  chaves: { telefone?: string | null; email?: string | null; cpfCnpj?: string | null },
  ignorarClienteId?: string,
) {
  const conditions = [];
  if (chaves.telefone) conditions.push(eq(cliente.telefone, chaves.telefone));
  if (chaves.email) conditions.push(eq(cliente.email, chaves.email));
  if (chaves.cpfCnpj) conditions.push(eq(cliente.cpfCnpj, chaves.cpfCnpj));

  if (conditions.length === 0) return { tipo: "novo" as const };

  const escopo = [eq(cliente.orgId, orgId), isNull(cliente.deletedAt), or(...conditions)!];
  if (ignorarClienteId) escopo.push(ne(cliente.id, ignorarClienteId));

  const candidatos = await db
    .select()
    .from(cliente)
    .where(and(...escopo));

  if (candidatos.length === 0) return { tipo: "novo" as const };

  let melhorScore = 0;
  let melhorId = "";
  for (const c of candidatos) {
    const score = calcularScoreDeduplicacao(chaves, {
      telefone: c.telefone,
      email: c.email,
      cpfCnpj: c.cpfCnpj,
    });
    if (score > melhorScore) { melhorScore = score; melhorId = c.id; }
  }

  return {
    tipo: classificarDeduplicacao(melhorScore),
    clienteIdExistente: melhorId,
    score: melhorScore,
  };
}

export async function registrarConsentimento(
  ctx: CrudContext,
  input: {
    clienteId: string;
    brandId: string;
    finalidade: "marketing" | "avaliacao" | "suporte" | "cobranca";
    canal: string;
    origem: string;
    prova?: string;
  }
) {
  const inputSchema = z.object({
    clienteId: z.string().uuid(),
    brandId: z.string().uuid(),
    finalidade: z.enum(["marketing", "avaliacao", "suporte", "cobranca"]),
    canal: z.enum(["whatsapp", "instagram", "facebook", "email", "mercadolivre", "shopee", "tiktokshop", "olist", "manual"]),
    origem: z.string().trim().min(1).max(120),
    prova: z.string().trim().max(500).optional(),
  }).parse(input);

  const [clienteValido, marcaValida] = await Promise.all([
    ctx.db.select({ id: cliente.id }).from(cliente).where(and(
      eq(cliente.id, inputSchema.clienteId), eq(cliente.orgId, ctx.orgId), isNull(cliente.deletedAt),
    )).then((rows) => rows[0]),
    ctx.db.select({ id: brand.id }).from(brand).where(and(
      eq(brand.id, inputSchema.brandId), eq(brand.orgId, ctx.orgId), eq(brand.active, true),
    )).then((rows) => rows[0]),
  ]);
  if (!clienteValido || !marcaValida) throw new Error("Cliente ou marca não pertence à organização.");

  const [novo] = await db
    .insert(consentimento)
    .values({
      clienteId: inputSchema.clienteId,
      orgId: ctx.orgId,
      brandId: inputSchema.brandId,
      finalidade: inputSchema.finalidade,
      canal: inputSchema.canal,
      status: "ativo",
      origem: inputSchema.origem,
      prova: inputSchema.prova,
    })
    .returning();

  await ctx.db.insert(auditLog).values({
    orgId: ctx.orgId,
    brandId: inputSchema.brandId,
    autorId: ctx.userId,
    autorTipo: ctx.userId ? "usuario" : "sistema",
    entidade: "consentimento",
    entidadeId: novo.id,
    acao: "registrado",
    depois: novo,
  });

  await emitirEvento({
    tipo: "cliente.consentimento_registrado",
    orgId: ctx.orgId,
    brandId: inputSchema.brandId,
    entidade: "consentimento",
    entidadeId: novo.id,
    payload: { clienteId: inputSchema.clienteId, finalidade: inputSchema.finalidade, canal: inputSchema.canal },
  });

  return novo;
}

export async function revogarConsentimento(ctx: CrudContext, consentimentoId: string) {
  assertPerfil(ctx, ["admin", "gestor"]);
  const anterior = await ctx.db.select().from(consentimento).where(and(
    eq(consentimento.id, consentimentoId),
    eq(consentimento.orgId, ctx.orgId),
  )).then((rows) => rows[0]);

  const [atualizado] = await db
    .update(consentimento)
    .set({ status: "revogado", revokedAt: new Date() })
    .where(and(eq(consentimento.id, consentimentoId), eq(consentimento.orgId, ctx.orgId)))
    .returning();

  if (!atualizado) throw new Error("Consentimento não encontrado.");

  await ctx.db.insert(auditLog).values({
    orgId: ctx.orgId,
    brandId: atualizado.brandId,
    autorId: ctx.userId,
    autorTipo: ctx.userId ? "usuario" : "sistema",
    entidade: "consentimento",
    entidadeId: consentimentoId,
    acao: "revogado",
    antes: anterior,
    depois: atualizado,
  });

  await emitirEvento({
    tipo: "cliente.consentimento_revogado",
    orgId: ctx.orgId,
    entidade: "consentimento",
    entidadeId: consentimentoId,
    payload: { clienteId: atualizado.clienteId },
  });

  return atualizado;
}
