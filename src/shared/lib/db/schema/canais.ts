import {
  pgTable, uuid, text, timestamp, jsonb, pgEnum, index, uniqueIndex, real, integer, boolean,
} from "drizzle-orm/pg-core";
import { org, brand } from "./org";

export const canalContaTipoEnum = pgEnum("canal_conta_tipo", [
  "mercadolivre", "shopee", "tiktokshop",
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
  uniqueIndex("uq_channel_account_org_brand_tipo").on(t.orgId, t.brandId, t.tipo),
]);

export const sincronizacaoModuloStatusEnum = pgEnum("sincronizacao_modulo_status", [
  "pendente", "em_andamento", "concluido", "erro",
]);

/** Uma execução da "Central de Sincronização" (Configurações), disparada
 *  manualmente por conta de canal — cada módulo roda em
 *  background via Inngest e atualiza sua própria coluna de status aqui, pra
 *  a tela poder mostrar progresso real em vez de um spinner mudo por 20s+. */
export const sincronizacaoExecucao = pgTable("sincronizacao_execucao", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => org.id),
  channelAccountId: uuid("channel_account_id").notNull().references(() => channelAccount.id),
  catalogoStatus: sincronizacaoModuloStatusEnum("catalogo_status").notNull().default("pendente"),
  catalogoResultado: jsonb("catalogo_resultado"),
  catalogoErro: text("catalogo_erro"),
  pedidosStatus: sincronizacaoModuloStatusEnum("pedidos_status").notNull().default("pendente"),
  pedidosResultado: jsonb("pedidos_resultado"),
  pedidosErro: text("pedidos_erro"),
  anunciosStatus: sincronizacaoModuloStatusEnum("anuncios_status").notNull().default("pendente"),
  anunciosResultado: jsonb("anuncios_resultado"),
  anunciosErro: text("anuncios_erro"),
  avaliacoesStatus: sincronizacaoModuloStatusEnum("avaliacoes_status").notNull().default("pendente"),
  avaliacoesResultado: jsonb("avaliacoes_resultado"),
  avaliacoesErro: text("avaliacoes_erro"),
  reputacaoStatus: sincronizacaoModuloStatusEnum("reputacao_status").notNull().default("pendente"),
  reputacaoResultado: jsonb("reputacao_resultado"),
  reputacaoErro: text("reputacao_erro"),
  reclamacoesStatus: sincronizacaoModuloStatusEnum("reclamacoes_status").notNull().default("pendente"),
  reclamacoesResultado: jsonb("reclamacoes_resultado"),
  reclamacoesErro: text("reclamacoes_erro"),
  mensagensStatus: sincronizacaoModuloStatusEnum("mensagens_status").notNull().default("pendente"),
  mensagensResultado: jsonb("mensagens_resultado"),
  mensagensErro: text("mensagens_erro"),
  iniciadoEm: timestamp("iniciado_em", { withTimezone: true }).notNull().defaultNow(),
  finalizadoEm: timestamp("finalizado_em", { withTimezone: true }),
}, (t) => [
  index("idx_sincronizacao_org").on(t.orgId),
  index("idx_sincronizacao_channel_account").on(t.channelAccountId),
  // O painel busca a última execução de cada conta (distinct on) e a idade da
  // reputação persistida; os dois caem nestes compostos.
  index("idx_sincronizacao_org_conta_iniciado").on(t.orgId, t.channelAccountId, t.iniciadoEm),
  index("idx_sincronizacao_org_iniciado").on(t.orgId, t.iniciadoEm),
]);

/** Uma linha por chamada feita via shopeeFetch (único ponto de saída pra
 *  Shopee no sistema — provider, webhook e renovação de token passam todos
 *  por ele). Existe só pra acompanhar consumo da cota do proxy de IP fixo
 *  (Webshare, antes Fixie — trocado em 24/08/2026 depois que a cota do
 *  Fixie estourou e derrubou a integração), que é limitado por mês — ver
 *  Configurações > Uso da API Shopee. */
export const shopeeApiCall = pgTable("shopee_api_call", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => org.id),
  caminho: text("caminho").notNull(),
  statusCode: integer("status_code"),
  ok: boolean("ok").notNull(),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_shopee_api_call_org_criado").on(t.orgId, t.criadoEm),
]);

/** Cache de notas/opiniões do Mercado Livre por anúncio ativo, mantido por um
 *  cron (ver A28-sync-avaliacoes-ml). A API do ML não tem endpoint de nota em
 *  lote — 1 requisição por anúncio — então a tela de Avaliações lê daqui em
 *  vez de consultar o ML na hora que a pessoa abre a aba. */
export const mlAvaliacaoAnuncio = pgTable("ml_avaliacao_anuncio", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => org.id),
  brandId: uuid("brand_id").notNull().references(() => brand.id),
  channelAccountId: uuid("channel_account_id").notNull().references(() => channelAccount.id),
  listingId: text("listing_id").notNull(),
  title: text("title").notNull(),
  permalink: text("permalink"),
  ratingAverage: real("rating_average"),
  reviewsTotal: integer("reviews_total"),
  ratingLevels: jsonb("rating_levels"),
  opinioes: jsonb("opinioes").notNull().default([]),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("uq_ml_avaliacao_org_listing").on(t.orgId, t.listingId),
  index("idx_ml_avaliacao_org_atualizado").on(t.orgId, t.atualizadoEm),
  index("idx_ml_avaliacao_brand").on(t.brandId),
]);

/** Mesma ideia do cache de avaliações do ML (mlAvaliacaoAnuncio) só que pra
 *  Shopee — tabela separada, não reaproveitada, porque listingId (item_id
 *  da Shopee) pode colidir com o do ML sob o mesmo org_id, e os dois canais
 *  têm ciclo de sincronização e formato de opinião próprios. get_comment da
 *  Shopee não devolve nota média agregada por item como o ML devolve — ela é
 *  calculada aqui a partir dos comentários coletados (ver
 *  sincronizarAvaliacoesShopeeConta). */
export const shopeeAvaliacaoAnuncio = pgTable("shopee_avaliacao_anuncio", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => org.id),
  brandId: uuid("brand_id").notNull().references(() => brand.id),
  channelAccountId: uuid("channel_account_id").notNull().references(() => channelAccount.id),
  itemId: text("item_id").notNull(),
  title: text("title").notNull(),
  ratingAverage: real("rating_average"),
  reviewsTotal: integer("reviews_total"),
  ratingLevels: jsonb("rating_levels"),
  opinioes: jsonb("opinioes").notNull().default([]),
  atualizadoEm: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("uq_shopee_avaliacao_org_item").on(t.orgId, t.itemId),
  index("idx_shopee_avaliacao_org_atualizado").on(t.orgId, t.atualizadoEm),
  index("idx_shopee_avaliacao_brand").on(t.brandId),
]);
