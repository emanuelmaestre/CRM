import {
  pgTable, uuid, text, timestamp, numeric, integer, boolean, pgEnum, index, uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { org, brand } from "./org";
import { channelAccount } from "./canais";
import { appUser } from "./users";

export const movimentoTipoEnum = pgEnum("movimento_tipo", [
  "entrada", "saida", "ajuste", "reserva", "estorno",
]);

export const produto = pgTable("produto", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => org.id),
  brandId: uuid("brand_id").notNull().references(() => brand.id),
  sku: text("sku").notNull(),
  nome: text("nome").notNull(),
  preco: numeric("preco", { precision: 12, scale: 2 }).notNull(),
  estoqueMinimo: integer("estoque_minimo").notNull().default(0),
  ativo: boolean("ativo").notNull().default(true),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_produto_org_brand").on(t.orgId, t.brandId),
  index("idx_produto_sku").on(t.orgId, t.sku),
  uniqueIndex("uq_produto_org_sku_active").on(t.orgId, t.sku)
    .where(sql`${t.deletedAt} is null`),
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

export const estoqueDivergenciaStatusEnum = pgEnum("estoque_divergencia_status", [
  "pendente", "aplicada", "ignorada",
]);

// Registro de divergências entre o saldo local e o saldo real no canal,
// detectadas pela reconciliação noturna (job A5). Fica pendente até um admin
// decidir aplicar o valor do canal (gera ajuste em estoque_movimento) ou
// ignorar — a correção nunca é automática, é sempre uma decisão humana.
export const estoqueDivergencia = pgTable("estoque_divergencia", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => org.id),
  produtoId: uuid("produto_id").notNull().references(() => produto.id),
  channelAccountId: uuid("channel_account_id").notNull().references(() => channelAccount.id),
  produtoCanalId: uuid("produto_canal_id").notNull(),
  saldoLocal: integer("saldo_local").notNull(),
  saldoCanal: integer("saldo_canal").notNull(),
  status: estoqueDivergenciaStatusEnum("status").notNull().default("pendente"),
  resolvidoPorId: uuid("resolvido_por_id").references(() => appUser.id),
  resolvidoEm: timestamp("resolvido_em", { withTimezone: true }),
  createdAt: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_estoque_divergencia_org").on(t.orgId),
  index("idx_estoque_divergencia_produto").on(t.produtoId),
  index("idx_estoque_divergencia_status").on(t.status),
  uniqueIndex("uq_estoque_divergencia_pendente")
    .on(t.produtoCanalId)
    .where(sql`${t.status} = 'pendente'`),
]);

// Mapeamento produto ↔ anúncio por canal. Permite A4 passar o listingId correto
// ao sincronizar estoque (o canal usa o ID do anúncio, não o SKU interno).
export const produtoCanal = pgTable("produto_canal", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => org.id),
  produtoId: uuid("produto_id").notNull().references(() => produto.id),
  channelAccountId: uuid("channel_account_id").notNull().references(() => channelAccount.id),
  externalListingId: text("external_listing_id").notNull(),
  externalSkuId: text("external_sku_id"),
  externalWarehouseId: text("external_warehouse_id"),
  ativo: boolean("ativo").notNull().default(true),
  createdAt: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_produto_canal_produto").on(t.produtoId),
  index("idx_produto_canal_conta").on(t.channelAccountId),
  uniqueIndex("uq_produto_canal").on(t.produtoId, t.channelAccountId),
]);
