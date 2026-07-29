import { and, eq, inArray } from "drizzle-orm";
import { assertPerfil, type CrudContext } from "@/shared/lib/crud-factory";
import { auditLog, cliente, clienteTag, segmento, tag } from "@/shared/lib/db/schema";
import { emitirEvento } from "@/shared/events";
import { CriarSegmentoSchema, type CriarSegmentoDTO, type FiltrosSegmento } from "../domain/segmentos";

const PERFIS_GERENCIAM_SEGMENTO = ["admin", "gestor"] as const;

export async function criarSegmento(ctx: CrudContext, input: CriarSegmentoDTO) {
  assertPerfil(ctx, [...PERFIS_GERENCIAM_SEGMENTO]);
  const data = CriarSegmentoSchema.parse(input);

  const tagsValidas = await ctx.db.select({ id: tag.id }).from(tag).where(and(
    eq(tag.orgId, ctx.orgId), inArray(tag.id, data.filtros.tagIds),
  ));
  if (tagsValidas.length !== data.filtros.tagIds.length) {
    throw new Error("Uma ou mais tags não pertencem à organização.");
  }

  const [novo] = await ctx.db.insert(segmento).values({
    orgId: ctx.orgId,
    nome: data.nome,
    filtros: data.filtros,
  }).returning();

  await ctx.db.insert(auditLog).values({
    orgId: ctx.orgId, autorId: ctx.userId, autorTipo: ctx.userId ? "usuario" : "sistema",
    entidade: "segmento", entidadeId: novo.id, acao: "create", depois: novo,
  });

  await emitirEvento({
    tipo: "cliente.segmento_criado", orgId: ctx.orgId, entidade: "segmento", entidadeId: novo.id,
    payload: { nome: novo.nome },
  });

  return novo;
}

export async function listarTagsReferencia(ctx: CrudContext) {
  assertPerfil(ctx, ["admin", "gestor", "vendedor"]);
  return ctx.db.select({ id: tag.id, nome: tag.nome, cor: tag.cor }).from(tag).where(eq(tag.orgId, ctx.orgId));
}

export async function listarSegmentos(ctx: CrudContext) {
  assertPerfil(ctx, ["admin", "gestor", "vendedor"]);
  const segmentos = await ctx.db.select().from(segmento).where(eq(segmento.orgId, ctx.orgId));

  const comContagem = await Promise.all(segmentos.map(async (item) => {
    const filtros = item.filtros as FiltrosSegmento;
    const membros = await ctx.db
      .selectDistinct({ clienteId: clienteTag.clienteId })
      .from(clienteTag)
      .where(inArray(clienteTag.tagId, filtros.tagIds ?? []));
    return { ...item, totalClientes: membros.length };
  }));

  return comContagem;
}

export async function listarClientesSegmento(ctx: CrudContext, segmentoId: string) {
  assertPerfil(ctx, ["admin", "gestor", "vendedor"]);
  const [item] = await ctx.db.select().from(segmento).where(and(
    eq(segmento.id, segmentoId), eq(segmento.orgId, ctx.orgId),
  ));
  if (!item) throw new Error("Segmento não encontrado.");

  const filtros = item.filtros as FiltrosSegmento;
  return ctx.db
    .selectDistinct({ id: cliente.id, nome: cliente.nome, email: cliente.email, telefone: cliente.telefone })
    .from(cliente)
    .innerJoin(clienteTag, eq(clienteTag.clienteId, cliente.id))
    .where(and(eq(cliente.orgId, ctx.orgId), inArray(clienteTag.tagId, filtros.tagIds ?? [])));
}

export async function excluirSegmento(ctx: CrudContext, segmentoId: string) {
  assertPerfil(ctx, [...PERFIS_GERENCIAM_SEGMENTO]);
  const [antes] = await ctx.db.select().from(segmento).where(and(
    eq(segmento.id, segmentoId), eq(segmento.orgId, ctx.orgId),
  ));
  if (!antes) throw new Error("Segmento não encontrado.");

  await ctx.db.delete(segmento).where(and(eq(segmento.id, segmentoId), eq(segmento.orgId, ctx.orgId)));

  await ctx.db.insert(auditLog).values({
    orgId: ctx.orgId, autorId: ctx.userId, autorTipo: ctx.userId ? "usuario" : "sistema",
    entidade: "segmento", entidadeId: segmentoId, acao: "delete", antes,
  });

  await emitirEvento({
    tipo: "cliente.segmento_excluido", orgId: ctx.orgId, entidade: "segmento", entidadeId: segmentoId,
    payload: { nome: antes.nome },
  });

  return { id: segmentoId };
}
