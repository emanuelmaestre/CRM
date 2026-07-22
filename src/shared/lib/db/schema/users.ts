import { boolean, pgTable, uuid, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { org } from "./org";

export const perfilEnum = pgEnum("perfil", ["admin", "gestor", "vendedor"]);

export const appUser = pgTable("app_user", {
  id: uuid("id").primaryKey(),
  orgId: uuid("org_id").notNull().references(() => org.id),
  email: text("email").notNull().unique(),
  nome: text("nome").notNull(),
  perfil: perfilEnum("perfil").notNull().default("vendedor"),
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
});
