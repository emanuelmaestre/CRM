import {
  pgTable, uuid, text, timestamp, boolean, pgEnum, jsonb, index,
} from "drizzle-orm/pg-core";
import { org, brand } from "./org";
import { cliente } from "./clientes";
import { channelAccount } from "./canais";
import { appUser } from "./users";

export const conversaStatusEnum = pgEnum("conversa_status", [
  "nova", "em_atendimento", "aguardando_cliente", "resolvida", "arquivada",
]);

export const mensagemDirecaoEnum = pgEnum("mensagem_direcao", [
  "entrada", "saida",
]);

export const conversa = pgTable("conversa", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => org.id),
  brandId: uuid("brand_id").notNull().references(() => brand.id),
  clienteId: uuid("cliente_id").references(() => cliente.id),
  channelAccountId: uuid("channel_account_id").notNull().references(() => channelAccount.id),
  responsavelId: uuid("responsavel_id").references(() => appUser.id),
  status: conversaStatusEnum("status").notNull().default("nova"),
  externalId: text("external_id"),
  createdAt: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_conversa_org").on(t.orgId),
  index("idx_conversa_brand").on(t.brandId),
  index("idx_conversa_cliente").on(t.clienteId),
  index("idx_conversa_status").on(t.status),
]);

export const mensagem = pgTable("mensagem", {
  id: uuid("id").primaryKey().defaultRandom(),
  conversaId: uuid("conversa_id").notNull().references(() => conversa.id),
  orgId: uuid("org_id").notNull().references(() => org.id),
  direcao: mensagemDirecaoEnum("direcao").notNull(),
  tipo: text("tipo").notNull().default("texto"),
  conteudo: text("conteudo").notNull(),
  providerMessageId: text("provider_message_id"),
  entregue: boolean("entregue").notNull().default(false),
  lida: boolean("lida").notNull().default(false),
  meta: jsonb("meta"),
  createdAt: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_mensagem_conversa").on(t.conversaId),
  index("idx_mensagem_provider").on(t.providerMessageId),
  index("idx_mensagem_criado").on(t.createdAt),
]);
