import {
  pgTable, uuid, text, timestamp, numeric, integer, boolean, index, uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { org, brand } from "./org";
import { channelAccount } from "./canais";

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

// Mapeamento produto ↔ anúncio por canal. Guarda o listingId que o canal usa
// (o canal não conhece o SKU interno), e é a chave do saldo por canal.
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

// Saldo que cada canal informa para o anúncio mapeado. É a única fonte de
// estoque do sistema: não existe saldo local nem livro-razão de movimentos.
//
// Como o mesmo lote físico é anunciado nos três canais, os números se repetem
// em vez de se somar — o saldo do produto é o MAIOR entre os canais, nunca a
// soma. Somar contaria a mesma peça três vezes.
export const estoqueCanalSaldo = pgTable("estoque_canal_saldo", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => org.id),
  produtoId: uuid("produto_id").notNull().references(() => produto.id),
  channelAccountId: uuid("channel_account_id").notNull().references(() => channelAccount.id),
  produtoCanalId: uuid("produto_canal_id").notNull()
    .references(() => produtoCanal.id, { onDelete: "cascade" }),
  saldo: integer("saldo").notNull(),
  // Quando o canal foi consultado pela última vez. O estoque tem a idade desta
  // marca — a UI precisa dela para não apresentar número velho como atual.
  verificadoEm: timestamp("verificado_em", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("uq_estoque_canal_saldo_mapeamento").on(t.produtoCanalId),
  index("idx_estoque_canal_saldo_produto").on(t.orgId, t.produtoId),
  index("idx_estoque_canal_saldo_conta").on(t.channelAccountId),
]);
