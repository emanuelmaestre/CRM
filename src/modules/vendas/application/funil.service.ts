import { and, asc, eq, isNull } from "drizzle-orm";
import { assertPerfil, type CrudContext } from "@/shared/lib/crud-factory";
import {
  appUser, auditLog, brand, cliente, funilEtapa, oportunidade,
} from "@/shared/lib/db/schema";
import { persistirEvento } from "@/shared/events";
import {
  CriarOportunidadeSchema, MoverOportunidadeSchema, type CriarOportunidadeDTO,
} from "../domain/funil";

const ETAPAS_PADRAO = [
  { nome: "Novo lead", ordem: 1, cor: "#64748b" },
  { nome: "Em contato", ordem: 2, cor: "#0284c7" },
  { nome: "Proposta", ordem: 3, cor: "#d97706" },
  { nome: "Ganho", ordem: 4, cor: "#16a34a" },
  { nome: "Perdida", ordem: 5, cor: "#dc2626" },
];

// Etapas terminais: uma oportunidade parada aqui não conta como "gargalo"
// (ela não está mais em andamento).
const NOMES_ETAPA_TERMINAL = ["ganho", "perdida"];

export async function listarFunil(ctx: CrudContext) {
  assertPerfil(ctx, ["admin", "gestor", "vendedor"]);

  const [etapas, oportunidades] = await Promise.all([
    ctx.db.select().from(funilEtapa)
      .where(eq(funilEtapa.orgId, ctx.orgId))
      .orderBy(asc(funilEtapa.ordem)),
    ctx.db
      .select({
        id: oportunidade.id,
        titulo: oportunidade.titulo,
        etapaId: oportunidade.etapaId,
        brandId: oportunidade.brandId,
        clienteId: oportunidade.clienteId,
        responsavelId: oportunidade.responsavelId,
        valor: oportunidade.valor,
        clienteNome: cliente.nome,
        responsavelNome: appUser.nome,
        createdAt: oportunidade.createdAt,
        updatedAt: oportunidade.updatedAt,
      })
      .from(oportunidade)
      .leftJoin(cliente, and(eq(cliente.id, oportunidade.clienteId), eq(cliente.orgId, ctx.orgId)))
      .leftJoin(appUser, and(eq(appUser.id, oportunidade.responsavelId), eq(appUser.orgId, ctx.orgId)))
      .where(eq(oportunidade.orgId, ctx.orgId)),
  ]);

  return { etapas, oportunidades };
}

export async function listarReferenciasFunil(ctx: CrudContext) {
  assertPerfil(ctx, ["admin", "gestor", "vendedor"]);
  const userFilter = ctx.perfil === "vendedor" && ctx.userId
    ? and(eq(appUser.orgId, ctx.orgId), eq(appUser.id, ctx.userId), eq(appUser.ativo, true))
    : and(eq(appUser.orgId, ctx.orgId), eq(appUser.ativo, true));

  const [marcas, clientes, responsaveis] = await Promise.all([
    ctx.db.select({ id: brand.id, nome: brand.name }).from(brand)
      .where(and(eq(brand.orgId, ctx.orgId), eq(brand.active, true)))
      .orderBy(asc(brand.name)),
    ctx.db.select({ id: cliente.id, nome: cliente.nome }).from(cliente)
      .where(and(eq(cliente.orgId, ctx.orgId), isNull(cliente.deletedAt)))
      .orderBy(asc(cliente.nome)).limit(200),
    ctx.db.select({ id: appUser.id, nome: appUser.nome }).from(appUser)
      .where(userFilter).orderBy(asc(appUser.nome)),
  ]);

  return { marcas, clientes, responsaveis };
}

export async function criarOportunidade(ctx: CrudContext, input: CriarOportunidadeDTO) {
  assertPerfil(ctx, ["admin", "gestor", "vendedor"]);
  const data = CriarOportunidadeSchema.parse(input);
  const responsavelId = ctx.perfil === "vendedor" ? ctx.userId : (data.responsavelId || ctx.userId);

  const [etapaValida, marcaValida, clienteValido, responsavelValido] = await Promise.all([
    ctx.db.select({ id: funilEtapa.id }).from(funilEtapa).where(and(
      eq(funilEtapa.id, data.etapaId), eq(funilEtapa.orgId, ctx.orgId),
    )).then((rows) => rows[0]),
    ctx.db.select({ id: brand.id }).from(brand).where(and(
      eq(brand.id, data.brandId), eq(brand.orgId, ctx.orgId), eq(brand.active, true),
    )).then((rows) => rows[0]),
    data.clienteId
      ? ctx.db.select({ id: cliente.id }).from(cliente).where(and(
          eq(cliente.id, data.clienteId), eq(cliente.orgId, ctx.orgId), isNull(cliente.deletedAt),
        )).then((rows) => rows[0])
      : Promise.resolve({ id: "optional" }),
    responsavelId
      ? ctx.db.select({ id: appUser.id }).from(appUser).where(and(
          eq(appUser.id, responsavelId), eq(appUser.orgId, ctx.orgId), eq(appUser.ativo, true),
        )).then((rows) => rows[0])
      : Promise.resolve({ id: "optional" }),
  ]);
  if (!etapaValida || !marcaValida || !clienteValido || !responsavelValido) {
    throw new Error("Etapa, marca, cliente ou responsável não pertence à organização.");
  }

  return ctx.db.transaction(async (tx) => {
    const [nova] = await tx.insert(oportunidade).values({
      orgId: ctx.orgId,
      brandId: data.brandId,
      clienteId: data.clienteId || null,
      etapaId: data.etapaId,
      responsavelId: responsavelId || null,
      titulo: data.titulo,
      valor: data.valor || null,
    }).returning();

    await tx.insert(auditLog).values({
      orgId: ctx.orgId,
      brandId: nova.brandId,
      autorId: ctx.userId,
      autorTipo: ctx.userId ? "usuario" : "sistema",
      entidade: "oportunidade",
      entidadeId: nova.id,
      acao: "create",
      depois: nova,
    });
    await persistirEvento({
      tipo: "oportunidade.criada",
      orgId: ctx.orgId,
      brandId: nova.brandId,
      entidade: "oportunidade",
      entidadeId: nova.id,
      payload: { etapaId: nova.etapaId, clienteId: nova.clienteId, responsavelId: nova.responsavelId },
    }, tx);
    return nova;
  });
}

export async function moverOportunidade(
  ctx: CrudContext,
  oportunidadeId: string,
  novaEtapaId: string,
  motivoPerda?: string,
) {
  assertPerfil(ctx, ["admin", "gestor", "vendedor"]);
  const ids = MoverOportunidadeSchema.parse({ oportunidadeId, novaEtapaId, motivoPerda });

  return ctx.db.transaction(async (tx) => {
    const [antes, etapaNova] = await Promise.all([
      tx.select().from(oportunidade).where(and(
        eq(oportunidade.id, ids.oportunidadeId), eq(oportunidade.orgId, ctx.orgId),
      )).then((rows) => rows[0]),
      tx.select({ id: funilEtapa.id, nome: funilEtapa.nome }).from(funilEtapa).where(and(
        eq(funilEtapa.id, ids.novaEtapaId), eq(funilEtapa.orgId, ctx.orgId),
      )).then((rows) => rows[0]),
    ]);
    if (!antes || !etapaNova) throw new Error("Oportunidade ou etapa não encontrada.");
    if (antes.etapaId === ids.novaEtapaId) return antes;

    if (etapaNova.nome.trim().toLowerCase() === "perdida" && !ids.motivoPerda) {
      throw new Error("Informe o motivo da perda para mover a oportunidade para esta etapa.");
    }

    const [atualizada] = await tx.update(oportunidade)
      .set({
        etapaId: ids.novaEtapaId,
        entrouEtapaEm: new Date(),
        motivoPerda: ids.motivoPerda || antes.motivoPerda,
        updatedAt: new Date(),
      })
      .where(and(eq(oportunidade.id, ids.oportunidadeId), eq(oportunidade.orgId, ctx.orgId)))
      .returning();
    await tx.insert(auditLog).values({
      orgId: ctx.orgId,
      brandId: atualizada.brandId,
      autorId: ctx.userId,
      autorTipo: ctx.userId ? "usuario" : "sistema",
      entidade: "oportunidade",
      entidadeId: atualizada.id,
      acao: "move",
      antes: { etapaId: antes.etapaId },
      depois: { etapaId: atualizada.etapaId },
    });
    await persistirEvento({
      tipo: "oportunidade.movida",
      orgId: ctx.orgId,
      brandId: atualizada.brandId,
      entidade: "oportunidade",
      entidadeId: atualizada.id,
      payload: { etapaAnteriorId: antes.etapaId, novaEtapaId: atualizada.etapaId },
    }, tx);
    return atualizada;
  });
}

export async function excluirOportunidade(ctx: CrudContext, oportunidadeId: string) {
  assertPerfil(ctx, ["admin", "gestor"]);
  const id = MoverOportunidadeSchema.shape.oportunidadeId.parse(oportunidadeId);

  return ctx.db.transaction(async (tx) => {
    const removida = await tx.delete(oportunidade)
      .where(and(eq(oportunidade.id, id), eq(oportunidade.orgId, ctx.orgId)))
      .returning().then((rows) => rows[0]);
    if (!removida) throw new Error("Oportunidade não encontrada.");
    await tx.insert(auditLog).values({
      orgId: ctx.orgId,
      brandId: removida.brandId,
      autorId: ctx.userId,
      autorTipo: ctx.userId ? "usuario" : "sistema",
      entidade: "oportunidade",
      entidadeId: removida.id,
      acao: "delete",
      antes: removida,
    });
    await persistirEvento({
      tipo: "oportunidade.excluida",
      orgId: ctx.orgId,
      brandId: removida.brandId,
      entidade: "oportunidade",
      entidadeId: removida.id,
      payload: { titulo: removida.titulo },
    }, tx);
    return { id: removida.id };
  });
}

// Não há histórico completo de mudanças de etapa (só a etapa atual +
// entrouEtapaEm), então o gargalo é medido pelo que dá pra medir com
// honestidade: quanto tempo, em média, as oportunidades ABERTAS estão
// paradas na etapa atual. Etapas terminais (Ganho/Perdida) ficam de fora —
// não é "gargalo" estar parado ali, é o fim do fluxo.
export async function analisarGargalosFunil(ctx: CrudContext) {
  assertPerfil(ctx, ["admin", "gestor", "vendedor"]);

  const etapas = await ctx.db.select().from(funilEtapa)
    .where(eq(funilEtapa.orgId, ctx.orgId)).orderBy(asc(funilEtapa.ordem));

  const abertas = await ctx.db
    .select({ etapaId: oportunidade.etapaId, entrouEtapaEm: oportunidade.entrouEtapaEm })
    .from(oportunidade)
    .where(eq(oportunidade.orgId, ctx.orgId));

  const agora = Date.now();
  const porEtapa = new Map<string, number[]>();
  for (const op of abertas) {
    const dias = (agora - op.entrouEtapaEm.getTime()) / 86_400_000;
    const lista = porEtapa.get(op.etapaId) ?? [];
    lista.push(dias);
    porEtapa.set(op.etapaId, lista);
  }

  return etapas
    .filter((etapa) => !NOMES_ETAPA_TERMINAL.includes(etapa.nome.trim().toLowerCase()))
    .map((etapa) => {
      const dias = porEtapa.get(etapa.id) ?? [];
      const mediaDias = dias.length > 0 ? dias.reduce((a, b) => a + b, 0) / dias.length : 0;
      const maiorEspera = dias.length > 0 ? Math.max(...dias) : 0;
      return {
        etapaId: etapa.id,
        etapaNome: etapa.nome,
        oportunidadesParadas: dias.length,
        mediaDiasParada: Math.round(mediaDias * 10) / 10,
        maiorEsperaDias: Math.round(maiorEspera * 10) / 10,
      };
    })
    .sort((a, b) => b.mediaDiasParada - a.mediaDiasParada);
}

export async function criarEtapasPadrao(ctx: CrudContext) {
  assertPerfil(ctx, ["admin", "gestor"]);
  const existentes = await ctx.db.select({ id: funilEtapa.id }).from(funilEtapa)
    .where(eq(funilEtapa.orgId, ctx.orgId)).limit(1);
  if (existentes.length > 0) return listarFunil(ctx).then((result) => result.etapas);

  return ctx.db.transaction(async (tx) => {
    const criadas = await tx.insert(funilEtapa).values(
      ETAPAS_PADRAO.map((item) => ({ ...item, orgId: ctx.orgId })),
    ).returning();
    for (const etapa of criadas) {
      await tx.insert(auditLog).values({
        orgId: ctx.orgId,
        autorId: ctx.userId,
        autorTipo: ctx.userId ? "usuario" : "sistema",
        entidade: "funil_etapa",
        entidadeId: etapa.id,
        acao: "create_default",
        depois: etapa,
      });
    }
    return criadas;
  });
}
