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
  index("idx_produto_org_atualizado").on(t.orgId, t.updatedAt),
  // O mesmo código pode existir em marcas diferentes (ex.: uma conta vende
  // um SKU originado de outra linha). A identidade do produto é marca+SKU;
  // manter a unicidade só na organização fazia o catálogo da segunda marca
  // cair silenciosamente como "ignorado".
  uniqueIndex("uq_produto_org_brand_sku_active").on(t.orgId, t.brandId, t.sku)
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
  // Quando o A5 vê o anúncio como "closed"/não encontrado pela primeira vez,
  // marca aqui — não desativa na hora, porque "encerrado" às vezes é um
  // soluço passageiro da API ou algo que o vendedor reabre. Só quando esse
  // estado persiste por 24h seguidas (várias execuções do job) o produto é
  // desativado de verdade. Volta a null assim que o anúncio reaparece ativo/pausado.
  mlEncerradoDesde: timestamp("ml_encerrado_desde", { withTimezone: true }),
  // Último status devolvido pela API de Itens do Mercado Livre. A coleta A5
  // já paga essa consulta a cada 6h para detectar anúncios encerrados; guardar
  // a resposta permite que Métricas mostre ativo/pausado/em revisão sem fazer
  // chamadas externas a cada troca de filtro.
  mlStatusAnuncio: text("ml_status_anuncio"),
  mlSubStatus: text("ml_sub_status"),
  mlStatusVerificadoEm: timestamp("ml_status_verificado_em", { withTimezone: true }),

  /* ── Espelho do anúncio no canal, para qualquer canal ──────────────────
     As três colunas `ml_*` acima nasceram quando o Mercado Livre era o
     único canal com coleta de status. Com a Shopee integrada elas passaram a
     significar "status, mas só de um canal": produto que só vive na Shopee
     aparecia sem status nenhum, sem nada explicando (133 vínculos Shopee com
     status vazio contra 656 de 658 preenchidos no ML).

     As colunas abaixo são do CANAL, seja ele qual for. As `ml_*` continuam
     sendo escritas por enquanto: a migration é aplicada à mão e o deploy vem
     depois, então há uma janela em que o código antigo ainda lê as antigas.
     `ml_sub_status` fica onde está — sub-status é vocabulário do ML mesmo. */

  /** Status cru que o canal informa para o anúncio: "active"/"paused"/
   *  "closed" no Mercado Livre, "NORMAL"/"UNLIST"/"BANNED"/"DELETED" na
   *  Shopee. Cru de propósito — a tradução para o vocabulário do CRM é da
   *  camada que exibe, e guardar já traduzido apagaria a diferença entre
   *  "o canal disse X" e "nós interpretamos X". */
  statusAnuncio: text("status_anuncio"),
  statusVerificadoEm: timestamp("status_verificado_em", { withTimezone: true }),
  /** Preço anunciado NO CANAL, que não é o `produto.preco` interno: o mesmo
   *  SKU costuma ter preço diferente em cada marketplace. */
  precoAnuncio: numeric("preco_anuncio", { precision: 12, scale: 2 }),
  /** Foto e link públicos do anúncio. O do Mercado Livre vem pronto da API;
   *  o da Shopee é montado a partir de shop_id + item_id, que é como a
   *  própria Shopee forma a URL do produto. */
  imagemUrl: text("imagem_url"),
  permalink: text("permalink"),
  createdAt: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_produto_canal_produto").on(t.produtoId),
  index("idx_produto_canal_conta").on(t.channelAccountId),
  index("idx_produto_canal_org_atualizado").on(t.orgId, t.updatedAt),
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
  index("idx_estoque_canal_saldo_org_verificado").on(t.orgId, t.verificadoEm),
]);
