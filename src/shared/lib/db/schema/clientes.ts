import {
  pgTable, uuid, text, timestamp, date, pgEnum, jsonb, index, uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { org, brand } from "./org";
import { appUser } from "./users";

export const canalEnum = pgEnum("canal_tipo", [
  "whatsapp", "instagram", "facebook", "email", "mercadolivre",
  "shopee", "tiktokshop", "olist", "manual",
]);

export const finalidadeEnum = pgEnum("finalidade_consentimento", [
  "marketing", "avaliacao", "suporte", "cobranca",
]);

export const statusConsentimentoEnum = pgEnum("status_consentimento", [
  "ativo", "revogado",
]);

export const lgpdSolicitacaoTipoEnum = pgEnum("lgpd_solicitacao_tipo", [
  "exportacao", "revogacao", "anonimizacao", "exclusao",
]);

export const lgpdSolicitacaoStatusEnum = pgEnum("lgpd_solicitacao_status", [
  "aberta", "em_analise", "concluida", "rejeitada",
]);

export const cliente = pgTable("cliente", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => org.id),
  nome: text("nome").notNull(),
  email: text("email"),
  telefone: text("telefone"),
  cpfCnpj: text("cpf_cnpj"),
  dataNascimento: date("data_nascimento"),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_cliente_org").on(t.orgId),
  index("idx_cliente_email").on(t.email),
  index("idx_cliente_telefone").on(t.telefone),
  index("idx_cliente_cpf").on(t.cpfCnpj),
  uniqueIndex("uq_cliente_org_email_active").on(t.orgId, t.email)
    .where(sql`${t.email} is not null and ${t.deletedAt} is null`),
  uniqueIndex("uq_cliente_org_telefone_active").on(t.orgId, t.telefone)
    .where(sql`${t.telefone} is not null and ${t.deletedAt} is null`),
  uniqueIndex("uq_cliente_org_cpf_active").on(t.orgId, t.cpfCnpj)
    .where(sql`${t.cpfCnpj} is not null and ${t.deletedAt} is null`),
]);

export const clienteIdentidade = pgTable("cliente_identidade", {
  id: uuid("id").primaryKey().defaultRandom(),
  clienteId: uuid("cliente_id").notNull().references(() => cliente.id),
  orgId: uuid("org_id").notNull().references(() => org.id),
  canal: canalEnum("canal").notNull(),
  externalId: text("external_id").notNull(),
  meta: jsonb("meta"),
  createdAt: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_identidade_cliente").on(t.clienteId),
  index("idx_identidade_external").on(t.canal, t.externalId),
  uniqueIndex("uq_identidade_org_canal_external").on(t.orgId, t.canal, t.externalId),
]);

export const consentimento = pgTable("consentimento", {
  id: uuid("id").primaryKey().defaultRandom(),
  clienteId: uuid("cliente_id").notNull().references(() => cliente.id),
  orgId: uuid("org_id").notNull().references(() => org.id),
  brandId: uuid("brand_id").notNull().references(() => brand.id),
  finalidade: finalidadeEnum("finalidade").notNull(),
  canal: canalEnum("canal").notNull(),
  status: statusConsentimentoEnum("status").notNull().default("ativo"),
  origem: text("origem").notNull(),
  prova: text("prova"),
  revokedAt: timestamp("revogado_em", { withTimezone: true }),
  createdAt: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_consentimento_cliente").on(t.clienteId),
  index("idx_consentimento_brand").on(t.brandId),
]);

export const tag = pgTable("tag", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => org.id),
  nome: text("nome").notNull(),
  cor: text("cor"),
  createdAt: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
});

export const clienteTag = pgTable("cliente_tag", {
  clienteId: uuid("cliente_id").notNull().references(() => cliente.id),
  tagId: uuid("tag_id").notNull().references(() => tag.id),
  createdAt: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_cliente_tag").on(t.clienteId),
]);

export const segmento = pgTable("segmento", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => org.id),
  nome: text("nome").notNull(),
  filtros: jsonb("filtros").notNull(),
  createdAt: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
});

export const interacao = pgTable("interacao", {
  id: uuid("id").primaryKey().defaultRandom(),
  clienteId: uuid("cliente_id").notNull().references(() => cliente.id),
  orgId: uuid("org_id").notNull().references(() => org.id),
  brandId: uuid("brand_id").references(() => brand.id),
  tipo: text("tipo").notNull(),
  canal: canalEnum("canal"),
  resumo: text("resumo"),
  meta: jsonb("meta"),
  autorId: uuid("autor_id").references(() => appUser.id),
  createdAt: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_interacao_cliente").on(t.clienteId),
  index("idx_interacao_criado").on(t.createdAt),
]);

export const lgpdSolicitacao = pgTable("lgpd_solicitacao", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => org.id),
  clienteId: uuid("cliente_id").notNull().references(() => cliente.id),
  tipo: lgpdSolicitacaoTipoEnum("tipo").notNull(),
  status: lgpdSolicitacaoStatusEnum("status").notNull().default("aberta"),
  motivo: text("motivo"),
  resultado: jsonb("resultado"),
  solicitanteId: uuid("solicitante_id").references(() => appUser.id),
  resolvidoPorId: uuid("resolvido_por_id").references(() => appUser.id),
  resolvidoEm: timestamp("resolvido_em", { withTimezone: true }),
  createdAt: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_lgpd_solicitacao_org").on(t.orgId),
  index("idx_lgpd_solicitacao_cliente").on(t.clienteId),
  index("idx_lgpd_solicitacao_status").on(t.status),
  index("idx_lgpd_solicitacao_criado").on(t.createdAt),
]);
