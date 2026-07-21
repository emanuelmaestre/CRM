import {
  pgTable, uuid, text, timestamp, jsonb, pgEnum, index,
} from "drizzle-orm/pg-core";
import { org, brand } from "./org";

export const canalContaTipoEnum = pgEnum("canal_conta_tipo", [
  "mercadolivre", "shopee", "tiktokshop", "olist",
  "whatsapp", "instagram", "facebook",
  "gmail", "gcalendar", "cobranca",
]);

export const canalContaStatusEnum = pgEnum("canal_conta_status", [
  "conectado", "degradado", "desconectado",
]);

export const channelAccount = pgTable("channel_account", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => org.id),
  brandId: uuid("brand_id").notNull().references(() => brand.id),
  tipo: canalContaTipoEnum("tipo").notNull(),
  nome: text("nome").notNull(),
  status: canalContaStatusEnum("status").notNull().default("desconectado"),
  vaultKey: text("vault_key").notNull(),
  meta: jsonb("meta"),
  ultimaVerificacao: timestamp("ultima_verificacao", { withTimezone: true }),
  ultimoErro: text("ultimo_erro"),
  createdAt: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_channel_org").on(t.orgId),
  index("idx_channel_brand").on(t.brandId),
]);
