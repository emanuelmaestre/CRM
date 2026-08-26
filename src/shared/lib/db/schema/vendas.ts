import {
  pgTable, uuid, text, timestamp, numeric, integer, pgEnum, index, uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { org, brand } from "./org";
import { cliente } from "./clientes";
import { produto } from "./estoque";
import { appUser } from "./users";
import { channelAccount } from "./canais";
import { importLote } from "./reguas";

export const pedidoStatusEnum = pgEnum("pedido_status", [
  "criado", "pago", "separado", "enviado", "entregue",
  "avaliacao_solicitada", "concluido", "cancelado", "devolvido",
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
  // Valor de frete informado pelo canal: custo real do vendedor no Mercado
  // Livre (GET /shipments/{id}/costs) e frete pago no checkout na Shopee
  // (`buyer_paid_shipping_fee` do escrow).
  frete: numeric("frete", { precision: 12, scale: 2 }).default("0"),
  desconto: numeric("desconto", { precision: 12, scale: 2 }).default("0"),
  // Valor a mais que o comprador pagou além do total nominal do pedido (ex.:
  // juro de parcelamento) — no Mercado Livre, soma de
  // payments[].total_paid_amount - payments[].transaction_amount.
  acrescimo: numeric("acrescimo", { precision: 12, scale: 2 }).default("0"),
  // Repasse líquido informado pelo canal. Na Shopee vem de
  // payment/get_escrow_detail(.batch) e é mais preciso que reconstruir o
  // líquido somando manualmente dezenas de subsídios, tarifas e ajustes.
  valorLiquido: numeric("valor_liquido", { precision: 12, scale: 2 }),
  canceladoMotivo: text("cancelado_motivo"),
  origemIngestao: text("origem_ingestao").notNull().default("tempo_real"),
  importLoteId: uuid("import_lote_id").references(() => importLote.id),
  importedAt: timestamp("importado_em", { withTimezone: true }),
  receivedAt: timestamp("recebido_em", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_pedido_org").on(t.orgId),
  index("idx_pedido_cliente").on(t.clienteId),
  index("idx_pedido_brand").on(t.brandId),
  index("idx_pedido_channel_account").on(t.channelAccountId),
  index("idx_pedido_status").on(t.status),
  index("idx_pedido_provider").on(t.providerOrderId),
  index("idx_pedido_recebido").on(t.receivedAt),
  index("idx_pedido_import_lote").on(t.importLoteId),
  // O cabeçalho consulta max(atualizado_em) por organização a cada checagem de
  // versão. Sem o composto, idx_pedido_org sozinho obriga a varrer todos os
  // pedidos da organização só pra achar o maior — com ele é uma leitura.
  index("idx_pedido_org_atualizado").on(t.orgId, t.updatedAt),
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
  // Comissão que o canal cobrou por este item (`sale_fee` do Mercado Livre ou
  // rateio das tarifas do escrow da Shopee). Null para pedidos sem financeiro
  // conhecido; a margem soma só o que o canal efetivamente informou.
  taxaMarketplace: numeric("taxa_marketplace", { precision: 12, scale: 2 }),
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
  // Atualizado a cada mudanca de etapa (ver moverOportunidade); junto com a
  // etapa atual, permite medir ha quanto tempo a oportunidade esta parada ali
  // — a analise de gargalo do funil nao tem historico completo de etapas,
  // so "tempo na etapa atual", mas isso ja e um indicador real e honesto.
  entrouEtapaEm: timestamp("entrou_etapa_em", { withTimezone: true }).notNull().defaultNow(),
  motivoPerda: text("motivo_perda"),
  createdAt: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_oportunidade_org").on(t.orgId),
  index("idx_oportunidade_cliente").on(t.clienteId),
]);

