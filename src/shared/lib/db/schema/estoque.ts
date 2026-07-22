import {
  pgTable, uuid, text, timestamp, numeric, integer, boolean, pgEnum, index, uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { org, brand } from "./org";
import { channelAccount } from "./canais";

export const movimentoTipoEnum = pgEnum("movimento_tipo", [
  "entrada", "saida", "ajuste", "reserva", "estorno",
]);

export const produto = pgTable("produto", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => org.id),
  brandId: uuid("brand_id").notNull().references(() => brand.id),
  sku: text("sku").notNull(),
  nome: text("nome").notNull(),
  custo: numeric("custo", { precision: 12, scale: 2 }),
  preco: numeric("preco", { precision: 12, scale: 2 }).notNull(),
  estoqueMinimo: integer("estoque_minimo").notNull().default(0),
  ativo: boolean("ativo").notNull().default(true),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_produto_org_brand").on(t.orgId, t.brandId),
  index("idx_produto_sku").on(t.orgId, t.sku),
]);

export const estoqueSaldo = pgTable("estoque_saldo", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => org.id),
  produtoId: uuid("produto_id").notNull().references(() => produto.id).unique(),
  saldo: integer("saldo").notNull().default(0),
  updatedAt: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_saldo_produto").on(t.produtoId),
]);

export const estoqueMovimento = pgTable("estoque_movimento", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => org.id),
  produtoId: uuid("produto_id").notNull().references(() => produto.id),
  tipo: movimentoTipoEnum("tipo").notNull(),
  quantidade: integer("quantidade").notNull(),
  referenciaId: uuid("referencia_id"),
  referenciaTipo: text("referencia_tipo"),
  observacao: text("observacao"),
  createdAt: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_movimento_produto").on(t.produtoId),
  index("idx_movimento_criado").on(t.createdAt),
  uniqueIndex("uq_movimento_referencia")
    .on(t.orgId, t.produtoId, t.referenciaTipo, t.referenciaId)
    .where(sql`${t.referenciaTipo} is not null and ${t.referenciaId} is not null`),
]);

// Mapeamento produto ↔ anúncio por canal. Permite A4 passar o listingId correto
// ao sincronizar estoque (o canal usa o ID do anúncio, não o SKU interno).
export const produtoCanal = pgTable("produto_canal", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => org.id),
  produtoId: uuid("produto_id").notNull().references(() => produto.id),
  channelAccountId: uuid("channel_account_id").notNull().references(() => channelAccount.id),
  externalListingId: text("external_listing_id").notNull(),
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_produto_canal_produto").on(t.produtoId),
  index("idx_produto_canal_conta").on(t.channelAccountId),
  uniqueIndex("uq_produto_canal").on(t.produtoId, t.channelAccountId),
]);
