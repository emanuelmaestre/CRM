import {
  pgTable, uuid, text, timestamp, numeric, integer, pgEnum, index, uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { org, brand } from "./org";
import { cliente } from "./clientes";
import { produto } from "./estoque";
import { appUser } from "./users";
import { channelAccount } from "./canais";

export const pedidoStatusEnum = pgEnum("pedido_status", [
  "criado", "pago", "separado", "enviado", "entregue",
  "avaliacao_solicitada", "concluido", "cancelado", "devolvido",
]);

export const tarefaStatusEnum = pgEnum("tarefa_status", [
  "pendente", "em_andamento", "concluida", "cancelada",
]);

export const pedido = pgTable("pedido", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => org.id),
  brandId: uuid("brand_id").notNull().references(() => brand.id),
  channelAccountId: uuid("channel_account_id").references(() => channelAccount.id),
  clienteId: uuid("cliente_id").notNull().references(() => cliente.id),
  providerOrderId: text("provider_order_id"),
  canal: text("canal").notNull(),
  status: pedidoStatusEnum("status").notNull().default("criado"),
  total: numeric("total", { precision: 12, scale: 2 }).notNull(),
  frete: numeric("frete", { precision: 12, scale: 2 }).default("0"),
  desconto: numeric("desconto", { precision: 12, scale: 2 }).default("0"),
  canceladoMotivo: text("cancelado_motivo"),
  createdAt: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_pedido_org").on(t.orgId),
  index("idx_pedido_cliente").on(t.clienteId),
  index("idx_pedido_brand").on(t.brandId),
  index("idx_pedido_channel_account").on(t.channelAccountId),
  index("idx_pedido_status").on(t.status),
  index("idx_pedido_provider").on(t.providerOrderId),
  uniqueIndex("uq_pedido_org_account_provider")
    .on(t.orgId, t.channelAccountId, t.providerOrderId)
    .where(sql`${t.channelAccountId} is not null and ${t.providerOrderId} is not null`),
  uniqueIndex("uq_pedido_org_canal_provider_legacy")
    .on(t.orgId, t.canal, t.providerOrderId)
    .where(sql`${t.channelAccountId} is null and ${t.providerOrderId} is not null`),
]);

export const pedidoItem = pgTable("pedido_item", {
  id: uuid("id").primaryKey().defaultRandom(),
  pedidoId: uuid("pedido_id").notNull().references(() => pedido.id),
  produtoId: uuid("produto_id").notNull().references(() => produto.id),
  quantidade: integer("quantidade").notNull(),
  precoUnitario: numeric("preco_unitario", { precision: 12, scale: 2 }).notNull(),
}, (t) => [
  index("idx_pedido_item_pedido").on(t.pedidoId),
]);

export const funilEtapa = pgTable("funil_etapa", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => org.id),
  nome: text("nome").notNull(),
  ordem: integer("ordem").notNull(),
  cor: text("cor"),
}, (t) => [
  uniqueIndex("uq_funil_etapa_org_ordem").on(t.orgId, t.ordem),
]);

export const oportunidade = pgTable("oportunidade", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => org.id),
  brandId: uuid("brand_id").notNull().references(() => brand.id),
  clienteId: uuid("cliente_id").references(() => cliente.id),
  etapaId: uuid("etapa_id").notNull().references(() => funilEtapa.id),
  responsavelId: uuid("responsavel_id").references(() => appUser.id),
  titulo: text("titulo").notNull(),
  valor: numeric("valor", { precision: 12, scale: 2 }),
  createdAt: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_oportunidade_org").on(t.orgId),
  index("idx_oportunidade_cliente").on(t.clienteId),
]);

export const tarefa = pgTable("tarefa", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => org.id),
  clienteId: uuid("cliente_id").references(() => cliente.id),
  responsavelId: uuid("responsavel_id").references(() => appUser.id),
  titulo: text("titulo").notNull(),
  descricao: text("descricao"),
  status: tarefaStatusEnum("status").notNull().default("pendente"),
  vencimentoEm: timestamp("vencimento_em", { withTimezone: true }),
  createdAt: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_tarefa_org").on(t.orgId),
  index("idx_tarefa_responsavel").on(t.responsavelId),
  index("idx_tarefa_vencimento").on(t.vencimentoEm),
  index("idx_tarefa_status").on(t.status),
]);

export const eventoAgenda = pgTable("evento_agenda", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => org.id),
  clienteId: uuid("cliente_id").references(() => cliente.id),
  responsavelId: uuid("responsavel_id").references(() => appUser.id),
  titulo: text("titulo").notNull(),
  inicio: timestamp("inicio", { withTimezone: true }).notNull(),
  fim: timestamp("fim", { withTimezone: true }),
  createdAt: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_evento_agenda_org").on(t.orgId),
  index("idx_evento_agenda_inicio").on(t.inicio),
  index("idx_evento_agenda_responsavel").on(t.responsavelId),
]);
