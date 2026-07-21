import { eq, and, isNull, desc, SQL, count } from "drizzle-orm";
import { db } from "./db";
import { auditLog } from "./db/schema";

export type Perfil = "admin" | "gestor" | "vendedor";

export interface CrudContext {
  db: typeof db;
  orgId: string;
  userId?: string;
  perfil: Perfil;
}

export interface ListOptions {
  limit?: number;
  offset?: number;
  filters?: SQL[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyPgTable = any;

export interface CrudFactoryOptions {
  table: AnyPgTable;
  entityName: string;
  allowedPerfis?: {
    create?: Perfil[];
    update?: Perfil[];
    delete?: Perfil[];
    read?: Perfil[];
  };
  softDelete?: boolean;
}

function checkPerfil(perfil: Perfil, allowed: Perfil[] = ["admin", "gestor", "vendedor"]) {
  if (!allowed.includes(perfil)) {
    throw new Error(`Perfil '${perfil}' não tem permissão para esta operação.`);
  }
}

async function registrarAuditoria(opts: {
  orgId: string;
  userId?: string;
  entidade: string;
  entidadeId: string;
  acao: string;
  antes?: unknown;
  depois?: unknown;
}) {
  await db.insert(auditLog).values({
    orgId: opts.orgId,
    autorId: opts.userId,
    autorTipo: opts.userId ? "usuario" : "sistema",
    entidade: opts.entidade,
    entidadeId: opts.entidadeId,
    acao: opts.acao,
    antes: opts.antes as Record<string, unknown> | undefined,
    depois: opts.depois as Record<string, unknown> | undefined,
  });
}

type Row = Record<string, unknown>;

export function createCrudFactory(options: CrudFactoryOptions) {
  const { table, entityName, allowedPerfis = {}, softDelete = false } = options;
  // Drizzle schema uses camelCase column objects (orgId, deletedAt, createdAt, updatedAt)
  const cols = table as unknown as Record<string, SQL>;

  return {
    async create(ctx: CrudContext, data: Row): Promise<Row> {
      checkPerfil(ctx.perfil, allowedPerfis.create);

      const [created] = await ctx.db
        .insert(table)
        .values({ ...data, orgId: ctx.orgId })
        .returning() as Row[];

      await registrarAuditoria({
        orgId: ctx.orgId,
        userId: ctx.userId,
        entidade: entityName,
        entidadeId: created.id as string,
        acao: "create",
        depois: created,
      });

      return created;
    },

    async getById(ctx: CrudContext, id: string): Promise<Row | null> {
      checkPerfil(ctx.perfil, allowedPerfis.read);

      const conditions: SQL[] = [
        eq(cols.id as never, id),
        eq(cols.orgId as never, ctx.orgId),
      ];
      if (softDelete && cols.deletedAt) conditions.push(isNull(cols.deletedAt as never));

      const rows = await ctx.db
        .select()
        .from(table)
        .where(and(...conditions)) as Row[];

      return rows[0] ?? null;
    },

    async list(ctx: CrudContext, opts: ListOptions = {}): Promise<{ data: Row[]; total: number; limit: number; offset: number }> {
      checkPerfil(ctx.perfil, allowedPerfis.read);

      const { limit = 20, offset = 0, filters = [] } = opts;

      const baseConditions: SQL[] = [eq(cols.orgId as never, ctx.orgId)];
      if (softDelete && cols.deletedAt) baseConditions.push(isNull(cols.deletedAt as never));

      const allConditions = [...baseConditions, ...filters];

      // Try common timestamp column names (camelCase)
      const orderCol = cols.createdAt ?? cols.id;

      const [rows, totalRows] = await Promise.all([
        ctx.db
          .select()
          .from(table)
          .where(and(...allConditions))
          .limit(limit)
          .offset(offset)
          .orderBy(desc(orderCol as never)) as Promise<Row[]>,
        ctx.db
          .select({ total: count() })
          .from(table)
          .where(and(...allConditions)) as Promise<{ total: number }[]>,
      ]);

      return { data: rows, total: totalRows[0]?.total ?? 0, limit, offset };
    },

    async update(ctx: CrudContext, id: string, data: Row): Promise<Row> {
      checkPerfil(ctx.perfil, allowedPerfis.update);

      const conditions: SQL[] = [
        eq(cols.id as never, id),
        eq(cols.orgId as never, ctx.orgId),
      ];

      const [before] = await ctx.db
        .select()
        .from(table)
        .where(and(...conditions)) as Row[];

      if (!before) throw new Error(`${entityName} não encontrado.`);

      const [updated] = await ctx.db
        .update(table)
        .set({ ...data, updatedAt: new Date() })
        .where(and(...conditions))
        .returning() as Row[];

      await registrarAuditoria({
        orgId: ctx.orgId,
        userId: ctx.userId,
        entidade: entityName,
        entidadeId: id,
        acao: "update",
        antes: before,
        depois: updated,
      });

      return updated;
    },

    async softDeleteById(ctx: CrudContext, id: string): Promise<{ id: string }> {
      checkPerfil(ctx.perfil, allowedPerfis.delete);

      if (!softDelete) throw new Error(`${entityName} não suporta soft delete.`);

      const conditions: SQL[] = [
        eq(cols.id as never, id),
        eq(cols.orgId as never, ctx.orgId),
      ];

      await ctx.db
        .update(table)
        .set({ deletedAt: new Date() })
        .where(and(...conditions));

      await registrarAuditoria({
        orgId: ctx.orgId,
        userId: ctx.userId,
        entidade: entityName,
        entidadeId: id,
        acao: "soft_delete",
      });

      return { id };
    },
  };
}
