import {
  pgTable, uuid, text, timestamp, date, jsonb, numeric, integer, boolean, index, uniqueIndex,
} from "drizzle-orm/pg-core";
import { org, brand } from "./org";
import { channelAccount } from "./canais";
import { produto } from "./estoque";

/* ── Módulo Anúncios (Product Ads / Mercado Livre) ────────────────
   Fase 1 (Dados) do módulo. A API do Mercado Livre só devolve a janela
   recente de métricas — não tem "me dá o histórico de 6 meses atrás".
   Por isso a estratégia é snapshot diário: uma linha por campanha/anúncio
   por dia, guardada aqui, e o histórico do produto passa a ser nosso banco,
   não um retry contra a API a cada consulta.

   Estrutura confirmada na documentação oficial atual: Advertiser → Campaign
   → Ads (item). Não existe "Ad Group" — cada anúncio pertence direto à
   campanha, sem camada intermediária. */

/** Um vendedor (marca) só tem um advertiser_id por site — descoberto uma vez
 *  via GET /advertising/advertisers?product_id=PADS e guardado aqui, para
 *  não precisar rechamar esse endpoint a cada sincronização. */
export const adsAdvertiser = pgTable("ads_advertiser", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => org.id),
  brandId: uuid("brand_id").notNull().references(() => brand.id),
  channelAccountId: uuid("channel_account_id").notNull().references(() => channelAccount.id),
  advertiserId: text("advertiser_id").notNull(),
  siteId: text("site_id").notNull(),
  descobertoEm: timestamp("descoberto_em", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("uq_ads_advertiser_conta").on(t.orgId, t.channelAccountId),
  index("idx_ads_advertiser_brand").on(t.brandId),
]);

/** Snapshot diário de uma campanha. Todas as métricas que o Mercado Livre
 *  expõe hoje (ver METRICAS_CAMPANHA no provider) — nenhuma é calculada
 *  aqui, isso é papel da Fase 2 (Métricas), que lê estas linhas e cruza com
 *  custo/margem do nosso banco. Reexecutar a sincronização no mesmo dia é
 *  idempotente: a chave única é (conta, campanha, data), então o job faz
 *  upsert, nunca duplica. */
export const adsCampanhaSnapshot = pgTable("ads_campanha_snapshot", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => org.id),
  brandId: uuid("brand_id").notNull().references(() => brand.id),
  channelAccountId: uuid("channel_account_id").notNull().references(() => channelAccount.id),
  campaignId: text("campaign_id").notNull(),
  data: date("data").notNull(),

  nome: text("nome").notNull(),
  status: text("status").notNull(),
  estrategia: text("estrategia").notNull(),
  canal: text("canal"),
  orcamento: numeric("orcamento", { precision: 12, scale: 2 }),
  roasObjetivo: numeric("roas_objetivo", { precision: 6, scale: 2 }),
  /** Ainda presente na resposta real apesar de anunciado em descontinuação
   *  — informativo, `roasObjetivo` é o alvo primário (ver break-even, Fase 2). */
  acosObjetivo: numeric("acos_objetivo", { precision: 6, scale: 2 }),
  moeda: text("moeda"),
  campanhaCriadaEm: timestamp("campanha_criada_em", { withTimezone: true }),
  campanhaAtualizadaEm: timestamp("campanha_atualizada_em", { withTimezone: true }),

  // Métricas cruas do Mercado Livre — nomeadas igual ao campo da API
  // (snake_case → camelCase direto), sem nenhuma tradução ou cálculo.
  clicks: integer("clicks"),
  prints: integer("prints"),
  ctr: numeric("ctr", { precision: 8, scale: 4 }),
  cost: numeric("cost", { precision: 12, scale: 2 }),
  cpc: numeric("cpc", { precision: 10, scale: 4 }),
  acos: numeric("acos", { precision: 8, scale: 4 }),
  roas: numeric("roas", { precision: 8, scale: 4 }),
  cvr: numeric("cvr", { precision: 8, scale: 4 }),
  sov: numeric("sov", { precision: 8, scale: 4 }),
  impressionShare: numeric("impression_share", { precision: 8, scale: 4 }),
  topImpressionShare: numeric("top_impression_share", { precision: 8, scale: 4 }),
  lostImpressionShareByBudget: numeric("lost_impression_share_by_budget", { precision: 8, scale: 4 }),
  lostImpressionShareByAdRank: numeric("lost_impression_share_by_ad_rank", { precision: 8, scale: 4 }),
  acosBenchmark: numeric("acos_benchmark", { precision: 8, scale: 4 }),
  organicUnitsQuantity: integer("organic_units_quantity"),
  organicUnitsAmount: numeric("organic_units_amount", { precision: 12, scale: 2 }),
  organicItemsQuantity: integer("organic_items_quantity"),
  directItemsQuantity: integer("direct_items_quantity"),
  indirectItemsQuantity: integer("indirect_items_quantity"),
  advertisingItemsQuantity: integer("advertising_items_quantity"),
  directUnitsQuantity: integer("direct_units_quantity"),
  indirectUnitsQuantity: integer("indirect_units_quantity"),
  unitsQuantity: integer("units_quantity"),
  directAmount: numeric("direct_amount", { precision: 12, scale: 2 }),
  indirectAmount: numeric("indirect_amount", { precision: 12, scale: 2 }),
  totalAmount: numeric("total_amount", { precision: 12, scale: 2 }),

  // Payload bruto completo, para campos novos que o ML adicionar antes da
  // gente atualizar o schema — nunca se perde dado por falta de coluna.
  bruto: jsonb("bruto"),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("uq_ads_campanha_snapshot_dia").on(t.orgId, t.channelAccountId, t.campaignId, t.data),
  index("idx_ads_campanha_snapshot_brand").on(t.brandId, t.data),
]);

/** Snapshot diário de um anúncio (item) dentro de uma campanha. Mesmas
 *  métricas do nível de campanha, agora por item — é aqui que a Fase 5
 *  (Produtos/classificação) vai ler para saber o que escalar/reduzir.
 *  `produtoId` liga ao catálogo interno quando o SKU bate com um produto
 *  já cadastrado; fica null quando o anúncio não tem correspondência local
 *  (produto ainda não sincronizado, ou catálogo/variação sem SKU mapeado). */
export const adsAnuncioSnapshot = pgTable("ads_anuncio_snapshot", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => org.id),
  brandId: uuid("brand_id").notNull().references(() => brand.id),
  channelAccountId: uuid("channel_account_id").notNull().references(() => channelAccount.id),
  campaignId: text("campaign_id").notNull(),
  itemId: text("item_id").notNull(),
  /** Confirmado ao vivo que existe no payload (ver mercadolivre-ads.provider.ts)
   *  — não é entidade navegável própria, é campo do anúncio. */
  adGroupId: text("ad_group_id"),
  produtoId: uuid("produto_id").references(() => produto.id),
  data: date("data").notNull(),

  titulo: text("titulo"),
  status: text("status"),
  preco: numeric("preco", { precision: 12, scale: 2 }),
  /** Sinal real do Mercado Livre — alimenta a "Oportunidade de Produto"
   *  do Radar (Fase 3): produto que o ML recomenda anunciar. */
  recomendado: boolean("recomendado"),
  buyBoxWinner: boolean("buy_box_winner"),
  logisticType: text("logistic_type"),
  domainId: text("domain_id"),
  permalink: text("permalink"),
  thumbnail: text("thumbnail"),

  clicks: integer("clicks"),
  prints: integer("prints"),
  ctr: numeric("ctr", { precision: 8, scale: 4 }),
  cost: numeric("cost", { precision: 12, scale: 2 }),
  cpc: numeric("cpc", { precision: 10, scale: 4 }),
  acos: numeric("acos", { precision: 8, scale: 4 }),
  roas: numeric("roas", { precision: 8, scale: 4 }),
  cvr: numeric("cvr", { precision: 8, scale: 4 }),
  organicUnitsQuantity: integer("organic_units_quantity"),
  directUnitsQuantity: integer("direct_units_quantity"),
  indirectUnitsQuantity: integer("indirect_units_quantity"),
  unitsQuantity: integer("units_quantity"),
  directAmount: numeric("direct_amount", { precision: 12, scale: 2 }),
  indirectAmount: numeric("indirect_amount", { precision: 12, scale: 2 }),
  totalAmount: numeric("total_amount", { precision: 12, scale: 2 }),

  bruto: jsonb("bruto"),
  criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("uq_ads_anuncio_snapshot_dia").on(t.orgId, t.channelAccountId, t.campaignId, t.itemId, t.data),
  index("idx_ads_anuncio_snapshot_brand").on(t.brandId, t.data),
  index("idx_ads_anuncio_snapshot_produto").on(t.produtoId),
]);
