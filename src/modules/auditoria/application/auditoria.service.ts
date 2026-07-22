import { and, count, desc, eq, gte, ilike, lte, or, type SQL } from "drizzle-orm";
import { assertPerfil, type CrudContext } from "@/shared/lib/crud-factory";
import { appUser, auditLog, brand } from "@/shared/lib/db/schema";
import { FiltrosAuditoriaSchema, type FiltrosAuditoriaDTO } from "../domain/filtros";

export async function listarAuditoria(ctx: CrudContext, input: FiltrosAuditoriaDTO = {}) {
  assertPerfil(ctx, ["admin"]);
  const filtros = FiltrosAuditoriaSchema.parse(input);
  const conditions: SQL[] = [eq(auditLog.orgId, ctx.orgId)];
  if (filtros.entidade) conditions.push(eq(auditLog.entidade, filtros.entidade));
  if (filtros.autorTipo) conditions.push(eq(auditLog.autorTipo, filtros.autorTipo));
  if (filtros.inicio) conditions.push(gte(auditLog.createdAt, filtros.inicio));
  if (filtros.fim) conditions.push(lte(auditLog.createdAt, filtros.fim));
  if (filtros.busca) {
    conditions.push(or(
      ilike(auditLog.entidade, `%${filtros.busca}%`),
      ilike(auditLog.acao, `%${filtros.busca}%`),
      ilike(appUser.nome, `%${filtros.busca}%`),
    )!);
  }
  const where = and(...conditions);
  const offset = (filtros.pagina - 1) * filtros.limite;
  const [data, totalRows] = await Promise.all([
    ctx.db.select({
      id: auditLog.id,
      entidade: auditLog.entidade,
      entidadeId: auditLog.entidadeId,
      acao: auditLog.acao,
      autorId: auditLog.autorId,
      autorNome: appUser.nome,
      autorTipo: auditLog.autorTipo,
      brandId: auditLog.brandId,
      brandNome: brand.name,
      antes: auditLog.antes,
      depois: auditLog.depois,
      ip: auditLog.ip,
      createdAt: auditLog.createdAt,
    }).from(auditLog)
      .leftJoin(appUser, and(eq(appUser.id, auditLog.autorId), eq(appUser.orgId, ctx.orgId)))
      .leftJoin(brand, and(eq(brand.id, auditLog.brandId), eq(brand.orgId, ctx.orgId)))
      .where(where).orderBy(desc(auditLog.createdAt)).limit(filtros.limite).offset(offset),
    ctx.db.select({ total: count() }).from(auditLog)
      .leftJoin(appUser, and(eq(appUser.id, auditLog.autorId), eq(appUser.orgId, ctx.orgId)))
      .where(where),
  ]);
  return { data, total: totalRows[0]?.total ?? 0, pagina: filtros.pagina, limite: filtros.limite };
}
