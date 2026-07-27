import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { assertPerfil, type CrudContext } from "@/shared/lib/crud-factory";
import {
  appUser,
  auditLog,
  cliente,
  clienteIdentidade,
  consentimento,
  interacao,
  lgpdSolicitacao,
} from "@/shared/lib/db/schema";
import { persistirEvento } from "@/shared/events";
import { exportarDadosCliente } from "./clientes.service";

const CriarSolicitacaoSchema = z.object({
  clienteId: z.string().uuid(),
  tipo: z.enum(["exportacao", "revogacao", "anonimizacao", "exclusao"]),
  motivo: z.string().trim().max(1000).optional(),
});

const RejeitarSolicitacaoSchema = z.object({
  solicitacaoId: z.string().uuid(),
  motivo: z.string().trim().min(3).max(1000),
});

const AnonimizarSolicitacaoSchema = z.object({
  solicitacaoId: z.string().uuid(),
  confirmacao: z.literal("ANONIMIZAR"),
});

export async function listarSolicitacoesLgpd(ctx: CrudContext) {
  assertPerfil(ctx, ["admin", "gestor"]);

  return ctx.db
    .select({
      id: lgpdSolicitacao.id,
      clienteId: lgpdSolicitacao.clienteId,
      clienteNome: cliente.nome,
      clienteEmail: cliente.email,
      tipo: lgpdSolicitacao.tipo,
      status: lgpdSolicitacao.status,
      motivo: lgpdSolicitacao.motivo,
      resultado: lgpdSolicitacao.resultado,
      solicitanteNome: appUser.nome,
      resolvidoPorId: lgpdSolicitacao.resolvidoPorId,
      resolvidoEm: lgpdSolicitacao.resolvidoEm,
      createdAt: lgpdSolicitacao.createdAt,
      updatedAt: lgpdSolicitacao.updatedAt,
    })
    .from(lgpdSolicitacao)
    .innerJoin(cliente, and(
      eq(cliente.id, lgpdSolicitacao.clienteId),
      eq(cliente.orgId, ctx.orgId),
    ))
    .leftJoin(appUser, eq(appUser.id, lgpdSolicitacao.solicitanteId))
    .where(eq(lgpdSolicitacao.orgId, ctx.orgId))
    .orderBy(desc(lgpdSolicitacao.createdAt))
    .limit(100);
}

export async function criarSolicitacaoLgpd(ctx: CrudContext, input: unknown) {
  assertPerfil(ctx, ["admin", "gestor"]);
  const data = CriarSolicitacaoSchema.parse(input);

  const clienteRow = await ctx.db
    .select({ id: cliente.id })
    .from(cliente)
    .where(and(eq(cliente.id, data.clienteId), eq(cliente.orgId, ctx.orgId)))
    .then((rows) => rows[0]);
  if (!clienteRow) throw new Error("Cliente nao encontrado para solicitacao LGPD.");

  const [created] = await ctx.db.insert(lgpdSolicitacao).values({
    orgId: ctx.orgId,
    clienteId: data.clienteId,
    tipo: data.tipo,
    motivo: data.motivo,
    solicitanteId: ctx.userId,
  }).returning();

  await ctx.db.insert(auditLog).values({
    orgId: ctx.orgId,
    autorId: ctx.userId,
    autorTipo: ctx.userId ? "usuario" : "sistema",
    entidade: "lgpd_solicitacao",
    entidadeId: created.id,
    acao: "create",
    depois: created,
  });

  return created;
}

export async function concluirExportacaoLgpd(ctx: CrudContext, solicitacaoId: string) {
  assertPerfil(ctx, ["admin", "gestor"]);
  const solicitacao = await buscarSolicitacaoAberta(ctx, solicitacaoId);
  if (solicitacao.tipo !== "exportacao") throw new Error("Solicitacao nao e de exportacao.");

  const pacote = await exportarDadosCliente(ctx, solicitacao.clienteId);
  const resultado = {
    tipo: "exportacao_json",
    geradoEm: pacote.geradoEm,
    clienteId: solicitacao.clienteId,
  };

  const [updated] = await ctx.db
    .update(lgpdSolicitacao)
    .set({
      status: "concluida",
      resultado,
      resolvidoPorId: ctx.userId,
      resolvidoEm: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(lgpdSolicitacao.id, solicitacaoId), eq(lgpdSolicitacao.orgId, ctx.orgId)))
    .returning();

  await ctx.db.insert(auditLog).values({
    orgId: ctx.orgId,
    autorId: ctx.userId,
    autorTipo: ctx.userId ? "usuario" : "sistema",
    entidade: "lgpd_solicitacao",
    entidadeId: solicitacaoId,
    acao: "exportacao_concluida",
    antes: solicitacao,
    depois: updated,
  });

  return { solicitacao: updated, pacote };
}

export async function rejeitarSolicitacaoLgpd(ctx: CrudContext, input: unknown) {
  assertPerfil(ctx, ["admin", "gestor"]);
  const data = RejeitarSolicitacaoSchema.parse(input);
  const solicitacao = await buscarSolicitacaoAberta(ctx, data.solicitacaoId);

  const [updated] = await ctx.db
    .update(lgpdSolicitacao)
    .set({
      status: "rejeitada",
      resultado: { motivo: data.motivo, rejeitadaEm: new Date().toISOString() },
      resolvidoPorId: ctx.userId,
      resolvidoEm: new Date(),
      updatedAt: new Date(),
    })
    .where(and(eq(lgpdSolicitacao.id, data.solicitacaoId), eq(lgpdSolicitacao.orgId, ctx.orgId)))
    .returning();

  await ctx.db.insert(auditLog).values({
    orgId: ctx.orgId,
    autorId: ctx.userId,
    autorTipo: ctx.userId ? "usuario" : "sistema",
    entidade: "lgpd_solicitacao",
    entidadeId: data.solicitacaoId,
    acao: "rejeitada",
    antes: solicitacao,
    depois: updated,
  });

  return updated;
}

export async function anonimizarSolicitacaoLgpd(ctx: CrudContext, input: unknown) {
  assertPerfil(ctx, ["admin"]);
  const data = AnonimizarSolicitacaoSchema.parse(input);
  const solicitacao = await buscarSolicitacaoAberta(ctx, data.solicitacaoId);
  if (!["anonimizacao", "exclusao"].includes(solicitacao.tipo)) {
    throw new Error("Solicitacao nao permite anonimizacao.");
  }

  const now = new Date();
  const resultado = await ctx.db.transaction(async (tx) => {
    const [clienteAntes] = await tx
      .select()
      .from(cliente)
      .where(and(eq(cliente.id, solicitacao.clienteId), eq(cliente.orgId, ctx.orgId)))
      .for("update");
    if (!clienteAntes) throw new Error("Cliente nao encontrado para anonimizacao.");

    await tx.update(cliente).set({
      nome: "Cliente anonimizado",
      email: null,
      telefone: null,
      cpfCnpj: null,
      dataNascimento: null,
      deletedAt: now,
      updatedAt: now,
    }).where(and(eq(cliente.id, solicitacao.clienteId), eq(cliente.orgId, ctx.orgId)));

    await tx.update(consentimento).set({
      status: "revogado",
      revokedAt: now,
    }).where(and(eq(consentimento.clienteId, solicitacao.clienteId), eq(consentimento.orgId, ctx.orgId)));

    const identidades = await tx
      .select({ id: clienteIdentidade.id })
      .from(clienteIdentidade)
      .where(and(eq(clienteIdentidade.clienteId, solicitacao.clienteId), eq(clienteIdentidade.orgId, ctx.orgId)));
    for (const identidade of identidades) {
      await tx.update(clienteIdentidade).set({
        externalId: `anon:${data.solicitacaoId}:${identidade.id}`,
        meta: { anonymizedAt: now.toISOString() },
      }).where(eq(clienteIdentidade.id, identidade.id));
    }

    await tx.update(interacao).set({
      resumo: "Interacao anonimizada por solicitacao LGPD.",
      meta: { anonymizedAt: now.toISOString(), lgpdSolicitacaoId: data.solicitacaoId },
    }).where(and(eq(interacao.clienteId, solicitacao.clienteId), eq(interacao.orgId, ctx.orgId)));

    const [updated] = await tx.update(lgpdSolicitacao).set({
      status: "concluida",
      resultado: {
        tipo: "anonimizacao",
        clienteId: solicitacao.clienteId,
        anonimizacaoEm: now.toISOString(),
        identidadesAnonimizadas: identidades.length,
      },
      resolvidoPorId: ctx.userId,
      resolvidoEm: now,
      updatedAt: now,
    }).where(and(eq(lgpdSolicitacao.id, data.solicitacaoId), eq(lgpdSolicitacao.orgId, ctx.orgId))).returning();

    await tx.insert(auditLog).values({
      orgId: ctx.orgId,
      autorId: ctx.userId,
      autorTipo: ctx.userId ? "usuario" : "sistema",
      entidade: "lgpd_solicitacao",
      entidadeId: data.solicitacaoId,
      acao: "anonimizacao_concluida",
      antes: { solicitacao, cliente: clienteAntes },
      depois: updated,
    });

    await persistirEvento({
      tipo: "lgpd.anonimizacao_concluida",
      orgId: ctx.orgId,
      entidade: "cliente",
      entidadeId: solicitacao.clienteId,
      causationId: data.solicitacaoId,
      payload: {
        solicitacaoId: data.solicitacaoId,
        identidadesAnonimizadas: identidades.length,
      },
    }, tx);

    return updated;
  });

  return resultado;
}

async function buscarSolicitacaoAberta(ctx: CrudContext, solicitacaoId: string) {
  const solicitacao = await ctx.db
    .select()
    .from(lgpdSolicitacao)
    .where(and(eq(lgpdSolicitacao.id, solicitacaoId), eq(lgpdSolicitacao.orgId, ctx.orgId)))
    .then((rows) => rows[0]);
  if (!solicitacao) throw new Error("Solicitacao LGPD nao encontrada.");
  if (!["aberta", "em_analise"].includes(solicitacao.status)) {
    throw new Error("Solicitacao LGPD ja foi finalizada.");
  }
  return solicitacao;
}
