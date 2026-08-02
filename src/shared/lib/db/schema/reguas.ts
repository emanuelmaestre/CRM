import {
  pgTable, uuid, text, timestamp, jsonb, pgEnum, integer, index, uniqueIndex,
} from "drizzle-orm/pg-core";
import { org, brand } from "./org";
import { cliente } from "./clientes";
import { channelAccount } from "./canais";
import { appUser } from "./users";

export const reguaStatusEnum = pgEnum("regua_status", ["ativa", "pausada", "arquivada"]);

export const execucaoStatusEnum = pgEnum("execucao_status", [
  "elegivel", "gates_aprovados", "agendada", "enviada",
  "confirmada", "falhou", "falha_definitiva", "bloqueada",
]);

export const gatilhoEnum = pgEnum("gatilho_tipo", [
  "pedido_entregue", "aniversario", "sem_compra", "manual", "evento_dominio",
]);

export const regua = pgTable("regua", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => org.id),
  brandId: uuid("brand_id").notNull().references(() => brand.id),
  nome: text("nome").notNull(),
  gatilho: gatilhoEnum("gatilho").notNull(),
  status: reguaStatusEnum("status").notNull().default("ativa"),
  condicoes: jsonb("condicoes"),
  templateId: uuid("template_id"),
  canal: text("canal").notNull(),
  delayDias: integer("delay_dias").notNull().default(0),
  cooldownHoras: integer("cooldown_horas").notNull().default(24),
  limiteDiarioCliente: integer("limite_diario_cliente").notNull().default(1),
  createdAt: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_regua_org").on(t.orgId),
  index("idx_regua_brand").on(t.brandId),
  index("idx_regua_gatilho").on(t.gatilho),
]);

export const templateMensagem = pgTable("template_mensagem", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => org.id),
  brandId: uuid("brand_id").notNull().references(() => brand.id),
  nome: text("nome").notNull(),
  canal: text("canal").notNull(),
  conteudo: text("conteudo").notNull(),
  variaveis: jsonb("variaveis"),
  aprovado: text("aprovado").notNull().default("false"),
  createdAt: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_template_org_brand").on(t.orgId, t.brandId),
]);

export const reguaExecucao = pgTable("regua_execucao", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => org.id),
  reguaId: uuid("regua_id").notNull().references(() => regua.id),
  clienteId: uuid("cliente_id").notNull().references(() => cliente.id),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  status: execucaoStatusEnum("status").notNull().default("elegivel"),
  gateBloqueado: text("gate_bloqueado"),
  motivoBloqueio: text("motivo_bloqueio"),
  tentativas: integer("tentativas").notNull().default(0),
  agendadaEm: timestamp("agendada_em", { withTimezone: true }),
  enviadaEm: timestamp("enviada_em", { withTimezone: true }),
  createdAt: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_execucao_regua").on(t.reguaId),
  index("idx_execucao_cliente").on(t.clienteId),
  index("idx_execucao_status").on(t.status),
]);

export const importLote = pgTable("import_lote", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => org.id),
  brandId: uuid("brand_id").references(() => brand.id),
  channelAccountId: uuid("channel_account_id").references(() => channelAccount.id),
  tipo: text("tipo").notNull(),
  nomeArquivo: text("nome_arquivo").notNull(),
  status: text("status").notNull().default("processando"),
  fase: text("fase").notNull().default("preparacao"),
  progresso: integer("progresso").notNull().default(0),
  configuracao: jsonb("configuracao"),
  solicitadoPorId: uuid("solicitado_por_id").references(() => appUser.id),
  totalLinhas: integer("total_linhas"),
  aceitos: integer("aceitos").notNull().default(0),
  rejeitados: integer("rejeitados").notNull().default(0),
  erros: jsonb("erros"),
  createdAt: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  finalizadoEm: timestamp("finalizado_em", { withTimezone: true }),
}, (t) => [
  index("idx_import_org").on(t.orgId),
  index("idx_import_brand").on(t.brandId),
  index("idx_import_channel_account").on(t.channelAccountId),
]);

export const importItem = pgTable("import_item", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => org.id),
  loteId: uuid("lote_id").notNull().references(() => importLote.id, { onDelete: "cascade" }),
  providerRecordId: text("provider_record_id").notNull(),
  status: text("status").notNull().default("pendente"),
  payload: jsonb("payload").notNull(),
  erros: jsonb("erros"),
  pedidoId: uuid("pedido_id"),
  createdAt: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_import_item_org").on(t.orgId),
  index("idx_import_item_lote_status").on(t.loteId, t.status),
  uniqueIndex("uq_import_item_lote_provider").on(t.loteId, t.providerRecordId),
]);
