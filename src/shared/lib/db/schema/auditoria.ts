import {
  pgTable, uuid, text, timestamp, jsonb, index,
} from "drizzle-orm/pg-core";
import { org, brand } from "./org";

export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => org.id),
  brandId: uuid("brand_id").references(() => brand.id),
  autorId: uuid("autor_id"),
  autorTipo: text("autor_tipo").notNull().default("usuario"),
  entidade: text("entidade").notNull(),
  entidadeId: uuid("entidade_id").notNull(),
  acao: text("acao").notNull(),
  antes: jsonb("antes"),
  depois: jsonb("depois"),
  ip: text("ip"),
  createdAt: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_audit_org").on(t.orgId),
  index("idx_audit_entidade").on(t.entidade, t.entidadeId),
  index("idx_audit_criado").on(t.createdAt),
]);

export const eventoDominio = pgTable("evento_dominio", {
  id: uuid("id").primaryKey().defaultRandom(),
  tipo: text("tipo").notNull(),
  orgId: uuid("org_id").notNull().references(() => org.id),
  brandId: uuid("brand_id").references(() => brand.id),
  entidade: text("entidade").notNull(),
  entidadeId: uuid("entidade_id").notNull(),
  causationId: uuid("causation_id"),
  payload: jsonb("payload").notNull(),
  processado: text("processado").notNull().default("false"),
  createdAt: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_evento_tipo").on(t.tipo),
  index("idx_evento_org").on(t.orgId),
  index("idx_evento_criado").on(t.createdAt),
]);

export const jobRun = pgTable("job_run", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").references(() => org.id),
  nome: text("nome").notNull(),
  status: text("status").notNull().default("rodando"),
  tentativa: text("tentativa").notNull().default("1"),
  erro: text("erro"),
  payload: jsonb("payload"),
  iniciadoEm: timestamp("iniciado_em", { withTimezone: true }).notNull().defaultNow(),
  finalizadoEm: timestamp("finalizado_em", { withTimezone: true }),
}, (t) => [
  index("idx_job_nome").on(t.nome),
  index("idx_job_status").on(t.status),
]);
