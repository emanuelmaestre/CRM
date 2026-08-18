import { boolean, pgTable, uuid, text, timestamp, pgEnum, jsonb } from "drizzle-orm/pg-core";
import { org } from "./org";
import { MODULOS_TODOS } from "@/config/modulos";

export const perfilEnum = pgEnum("perfil", ["admin", "gestor", "vendedor"]);

export const appUser = pgTable("app_user", {
  id: uuid("id").primaryKey(),
  orgId: uuid("org_id").notNull().references(() => org.id),
  email: text("email").notNull().unique(),
  nome: text("nome").notNull(),
  perfil: perfilEnum("perfil").notNull().default("vendedor"),
  /** Rótulo livre de cargo (ex.: "Diretor", "Publicitário") — só exibição,
   *  não tem peso de permissão. Quem decide o que a pessoa pode FAZER
   *  continua sendo `perfil`; quem decide o que ela VÊ no menu é
   *  `modulosVisiveis` logo abaixo. Null = mostra o label padrão do perfil. */
  cargo: text("cargo"),
  /** Lista de ids de módulo (ver src/config/modulos.ts) que aparecem no menu
   *  para este usuário. Por padrão todo mundo vê tudo — quem cria um usuário
   *  novo escolhe reduzir esse conjunto, nunca o contrário. */
  modulosVisiveis: jsonb("modulos_visiveis").notNull().default(MODULOS_TODOS),
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
});
