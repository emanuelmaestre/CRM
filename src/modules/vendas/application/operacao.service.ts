import { and, asc, desc, eq, gte, ilike, isNull, lte, or, type SQL } from "drizzle-orm";
import { assertPerfil, type CrudContext } from "@/shared/lib/crud-factory";
import { appUser, auditLog, cliente, eventoAgenda, tarefa } from "@/shared/lib/db/schema";
import { persistirEvento } from "@/shared/events";
import {
  AtualizarStatusTarefaSchema,
  CriarEventoAgendaSchema,
  CriarTarefaSchema,
  FiltrosAgendaSchema,
  FiltrosTarefaSchema,
  type CriarEventoAgendaDTO,
  type CriarTarefaDTO,
  type FiltrosAgendaDTO,
  type FiltrosTarefaDTO,
} from "../domain/operacao";

function podeGerenciarResponsavel(ctx: CrudContext, responsavelId: string | null) {
  return ctx.perfil !== "vendedor" || responsavelId === ctx.userId;
}

async function validarReferencias(
  ctx: CrudContext,
  clienteId?: string,
  responsavelId?: string,
) {
  const [clienteValido, responsavelValido] = await Promise.all([
    clienteId
      ? ctx.db.select({ id: cliente.id }).from(cliente).where(and(
          eq(cliente.id, clienteId), eq(cliente.orgId, ctx.orgId), isNull(cliente.deletedAt),
        )).then((rows) => rows[0])
      : Promise.resolve({ id: "optional" }),
    responsavelId
      ? ctx.db.select({ id: appUser.id }).from(appUser).where(and(
          eq(appUser.id, responsavelId), eq(appUser.orgId, ctx.orgId), eq(appUser.ativo, true),
        )).then((rows) => rows[0])
      : Promise.resolve({ id: "optional" }),
  ]);
  if (!clienteValido || !responsavelValido) {
    throw new Error("Cliente ou responsável não pertence à organização.");
  }
}

export async function listarReferenciasOperacao(ctx: CrudContext) {
  assertPerfil(ctx, ["admin", "gestor", "vendedor"]);
  const condicaoResponsavel = ctx.perfil === "vendedor"
    ? and(eq(appUser.orgId, ctx.orgId), eq(appUser.id, ctx.userId!), eq(appUser.ativo, true))
    : and(eq(appUser.orgId, ctx.orgId), eq(appUser.ativo, true));
  const [clientes, responsaveis] = await Promise.all([
    ctx.db.select({ id: cliente.id, nome: cliente.nome }).from(cliente)
      .where(and(eq(cliente.orgId, ctx.orgId), isNull(cliente.deletedAt))).orderBy(asc(cliente.nome)).limit(300),
    ctx.db.select({ id: appUser.id, nome: appUser.nome }).from(appUser)
      .where(condicaoResponsavel).orderBy(asc(appUser.nome)),
  ]);
  return { clientes, responsaveis };
}

export async function listarTarefas(ctx: CrudContext, input: FiltrosTarefaDTO = {}) {
  assertPerfil(ctx, ["admin", "gestor", "vendedor"]);
  const filtros = FiltrosTarefaSchema.parse(input);
  const conditions: SQL[] = [eq(tarefa.orgId, ctx.orgId)];
  if (ctx.perfil === "vendedor") conditions.push(eq(tarefa.responsavelId, ctx.userId!));
  if (filtros.status) conditions.push(eq(tarefa.status, filtros.status));
  if (filtros.responsavelId && ctx.perfil !== "vendedor") {
    conditions.push(eq(tarefa.responsavelId, filtros.responsavelId));
  }
  if (filtros.busca) {
    conditions.push(or(
      ilike(tarefa.titulo, `%${filtros.busca}%`),
      ilike(tarefa.descricao, `%${filtros.busca}%`),
    )!);
  }
  return ctx.db.select({
    id: tarefa.id,
    titulo: tarefa.titulo,
    descricao: tarefa.descricao,
    status: tarefa.status,
    vencimentoEm: tarefa.vencimentoEm,
    clienteId: tarefa.clienteId,
    clienteNome: cliente.nome,
    responsavelId: tarefa.responsavelId,
    responsavelNome: appUser.nome,
    createdAt: tarefa.createdAt,
    updatedAt: tarefa.updatedAt,
  }).from(tarefa)
    .leftJoin(cliente, and(eq(cliente.id, tarefa.clienteId), eq(cliente.orgId, ctx.orgId)))
    .leftJoin(appUser, and(eq(appUser.id, tarefa.responsavelId), eq(appUser.orgId, ctx.orgId)))
    .where(and(...conditions)).orderBy(asc(tarefa.vencimentoEm), desc(tarefa.createdAt)).limit(200);
}

export async function criarTarefa(ctx: CrudContext, input: CriarTarefaDTO) {
  assertPerfil(ctx, ["admin", "gestor", "vendedor"]);
  const data = CriarTarefaSchema.parse(input);
  const responsavelId = ctx.perfil === "vendedor" ? ctx.userId : (data.responsavelId || ctx.userId);
  await validarReferencias(ctx, data.clienteId || undefined, responsavelId);
  return ctx.db.transaction(async (tx) => {
    const [criada] = await tx.insert(tarefa).values({
      orgId: ctx.orgId,
      clienteId: data.clienteId || null,
      responsavelId: responsavelId || null,
      titulo: data.titulo,
      descricao: data.descricao || null,
      vencimentoEm: data.vencimentoEm || null,
    }).returning();
    await tx.insert(auditLog).values({
      orgId: ctx.orgId, autorId: ctx.userId, entidade: "tarefa", entidadeId: criada.id,
      acao: "create", depois: criada,
    });
    await persistirEvento({
      tipo: "tarefa.criada", orgId: ctx.orgId, entidade: "tarefa", entidadeId: criada.id,
      payload: { responsavelId: criada.responsavelId, clienteId: criada.clienteId, vencimentoEm: criada.vencimentoEm },
    }, tx);
    return criada;
  });
}

export async function atualizarStatusTarefa(ctx: CrudContext, tarefaId: string, status: string) {
  assertPerfil(ctx, ["admin", "gestor", "vendedor"]);
  const input = AtualizarStatusTarefaSchema.parse({ tarefaId, status });
  return ctx.db.transaction(async (tx) => {
    const antes = await tx.select().from(tarefa).where(and(
      eq(tarefa.id, input.tarefaId), eq(tarefa.orgId, ctx.orgId),
    )).then((rows) => rows[0]);
    if (!antes || !podeGerenciarResponsavel(ctx, antes.responsavelId)) throw new Error("Tarefa não encontrada.");
    if (antes.status === input.status) return antes;
    const [atualizada] = await tx.update(tarefa).set({ status: input.status, updatedAt: new Date() })
      .where(and(eq(tarefa.id, input.tarefaId), eq(tarefa.orgId, ctx.orgId))).returning();
    await tx.insert(auditLog).values({
      orgId: ctx.orgId, autorId: ctx.userId, entidade: "tarefa", entidadeId: atualizada.id,
      acao: "status_change", antes: { status: antes.status }, depois: { status: atualizada.status },
    });
    await persistirEvento({
      tipo: "tarefa.status_alterado", orgId: ctx.orgId, entidade: "tarefa", entidadeId: atualizada.id,
      payload: { statusAnterior: antes.status, status: atualizada.status, responsavelId: atualizada.responsavelId },
    }, tx);
    return atualizada;
  });
}

export async function listarAgenda(ctx: CrudContext, input: FiltrosAgendaDTO) {
  assertPerfil(ctx, ["admin", "gestor", "vendedor"]);
  const filtros = FiltrosAgendaSchema.parse(input);
  const conditions: SQL[] = [
    eq(eventoAgenda.orgId, ctx.orgId), gte(eventoAgenda.inicio, filtros.inicio), lte(eventoAgenda.inicio, filtros.fim),
  ];
  if (ctx.perfil === "vendedor") conditions.push(eq(eventoAgenda.responsavelId, ctx.userId!));
  if (filtros.responsavelId && ctx.perfil !== "vendedor") {
    conditions.push(eq(eventoAgenda.responsavelId, filtros.responsavelId));
  }
  return ctx.db.select({
    id: eventoAgenda.id,
    titulo: eventoAgenda.titulo,
    inicio: eventoAgenda.inicio,
    fim: eventoAgenda.fim,
    clienteId: eventoAgenda.clienteId,
    clienteNome: cliente.nome,
    responsavelId: eventoAgenda.responsavelId,
    responsavelNome: appUser.nome,
    createdAt: eventoAgenda.createdAt,
  }).from(eventoAgenda)
    .leftJoin(cliente, and(eq(cliente.id, eventoAgenda.clienteId), eq(cliente.orgId, ctx.orgId)))
    .leftJoin(appUser, and(eq(appUser.id, eventoAgenda.responsavelId), eq(appUser.orgId, ctx.orgId)))
    .where(and(...conditions)).orderBy(asc(eventoAgenda.inicio)).limit(300);
}

export async function criarEventoAgenda(ctx: CrudContext, input: CriarEventoAgendaDTO) {
  assertPerfil(ctx, ["admin", "gestor", "vendedor"]);
  const data = CriarEventoAgendaSchema.parse(input);
  const responsavelId = ctx.perfil === "vendedor" ? ctx.userId : (data.responsavelId || ctx.userId);
  await validarReferencias(ctx, data.clienteId || undefined, responsavelId);
  return ctx.db.transaction(async (tx) => {
    const [criado] = await tx.insert(eventoAgenda).values({
      orgId: ctx.orgId, clienteId: data.clienteId || null, responsavelId: responsavelId || null,
      titulo: data.titulo, inicio: data.inicio, fim: data.fim || null,
    }).returning();
    await tx.insert(auditLog).values({
      orgId: ctx.orgId, autorId: ctx.userId, entidade: "evento_agenda", entidadeId: criado.id,
      acao: "create", depois: criado,
    });
    await persistirEvento({
      tipo: "agenda.evento_criado", orgId: ctx.orgId, entidade: "evento_agenda", entidadeId: criado.id,
      payload: { inicio: criado.inicio, fim: criado.fim, responsavelId: criado.responsavelId, clienteId: criado.clienteId },
    }, tx);
    return criado;
  });
}

export async function excluirEventoAgenda(ctx: CrudContext, eventoId: string) {
  assertPerfil(ctx, ["admin", "gestor", "vendedor"]);
  const id = AtualizarStatusTarefaSchema.shape.tarefaId.parse(eventoId);
  return ctx.db.transaction(async (tx) => {
    const antes = await tx.select().from(eventoAgenda).where(and(
      eq(eventoAgenda.id, id), eq(eventoAgenda.orgId, ctx.orgId),
    )).then((rows) => rows[0]);
    if (!antes || !podeGerenciarResponsavel(ctx, antes.responsavelId)) throw new Error("Evento não encontrado.");
    await tx.delete(eventoAgenda).where(and(eq(eventoAgenda.id, id), eq(eventoAgenda.orgId, ctx.orgId)));
    await tx.insert(auditLog).values({
      orgId: ctx.orgId, autorId: ctx.userId, entidade: "evento_agenda", entidadeId: antes.id,
      acao: "delete", antes,
    });
    await persistirEvento({
      tipo: "agenda.evento_excluido", orgId: ctx.orgId, entidade: "evento_agenda", entidadeId: antes.id,
      payload: { titulo: antes.titulo, inicio: antes.inicio, responsavelId: antes.responsavelId },
    }, tx);
    return { id };
  });
}
