import { eq, and, or, isNull, ilike } from "drizzle-orm";
import { z } from "zod";
import { createCrudFactory, type CrudContext } from "@/shared/lib/crud-factory";
import { db } from "@/shared/lib/db";
import { cliente, consentimento } from "@/shared/lib/db/schema";
import { emitirEvento } from "@/shared/events";
import {
  CreateClienteSchema, UpdateClienteSchema,
  type CreateClienteDTO, type UpdateClienteDTO,
} from "../domain/entities";
import {
  normalizarTelefone, normalizarEmail,
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
  const data = CreateClienteSchema.parse(input);

  if (data.telefone) data.telefone = normalizarTelefone(data.telefone);
  if (data.email) data.email = normalizarEmail(data.email);

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
  const data = UpdateClienteSchema.parse(input);
  if (data.telefone) data.telefone = normalizarTelefone(data.telefone);
  if (data.email) data.email = normalizarEmail(data.email);
  return crudCliente.update(ctx, id, data);
}

export async function arquivarCliente(ctx: CrudContext, id: string) {
  return crudCliente.softDeleteById(ctx, id);
}

async function verificarDeduplicacao(
  orgId: string,
  chaves: { telefone?: string | null; email?: string | null; cpfCnpj?: string | null }
) {
  const conditions = [];
  if (chaves.telefone) conditions.push(eq(cliente.telefone, chaves.telefone));
  if (chaves.email) conditions.push(eq(cliente.email, chaves.email));
  if (chaves.cpfCnpj) conditions.push(eq(cliente.cpfCnpj, chaves.cpfCnpj));

  if (conditions.length === 0) return { tipo: "novo" as const };

  const candidatos = await db
    .select()
    .from(cliente)
    .where(and(eq(cliente.orgId, orgId), isNull(cliente.deletedAt), or(...conditions)));

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
  const [novo] = await db
    .insert(consentimento)
    .values({
      clienteId: input.clienteId,
      orgId: ctx.orgId,
      brandId: input.brandId,
      finalidade: input.finalidade,
      canal: input.canal as never,
      status: "ativo",
      origem: input.origem,
      prova: input.prova,
    })
    .returning();

  await emitirEvento({
    tipo: "cliente.consentimento_registrado",
    orgId: ctx.orgId,
    brandId: input.brandId,
    entidade: "consentimento",
    entidadeId: novo.id,
    payload: { clienteId: input.clienteId, finalidade: input.finalidade, canal: input.canal },
  });

  return novo;
}

export async function revogarConsentimento(ctx: CrudContext, consentimentoId: string) {
  const [atualizado] = await db
    .update(consentimento)
    .set({ status: "revogado", revokedAt: new Date() })
    .where(and(eq(consentimento.id, consentimentoId), eq(consentimento.orgId, ctx.orgId)))
    .returning();

  await emitirEvento({
    tipo: "cliente.consentimento_revogado",
    orgId: ctx.orgId,
    entidade: "consentimento",
    entidadeId: consentimentoId,
    payload: { clienteId: atualizado.clienteId },
  });

  return atualizado;
}
