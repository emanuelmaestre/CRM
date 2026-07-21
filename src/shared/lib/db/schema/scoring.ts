import {
  pgTable, uuid, text, timestamp, numeric, integer, jsonb, index,
} from "drizzle-orm/pg-core";
import { org } from "./org";
import { cliente } from "./clientes";
import { produto } from "./estoque";

export const scoreCliente = pgTable("score_cliente", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => org.id),
  clienteId: uuid("cliente_id").notNull().references(() => cliente.id).unique(),
  churnRisk: integer("churn_risk").notNull().default(0),
  rfmRecencia: integer("rfm_recencia").notNull().default(0),
  rfmFrequencia: integer("rfm_frequencia").notNull().default(0),
  rfmValor: numeric("rfm_valor", { precision: 12, scale: 2 }),
  proximaCompraEstimada: timestamp("proxima_compra_estimada", { withTimezone: true }),
  explicacao: text("explicacao"),
  versaoFormula: text("versao_formula").notNull().default("v1"),
  calculadoEm: timestamp("calculado_em", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_score_cliente_org").on(t.orgId),
  index("idx_score_cliente_churn").on(t.churnRisk),
]);

export const scoreProduto = pgTable("score_produto", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => org.id),
  produtoId: uuid("produto_id").notNull().references(() => produto.id).unique(),
  riscoEncalhe: integer("risco_encalhe").notNull().default(0),
  diasSemVenda: integer("dias_sem_venda").notNull().default(0),
  capitalParado: numeric("capital_parado", { precision: 12, scale: 2 }),
  acaoSugerida: text("acao_sugerida"),
  versaoFormula: text("versao_formula").notNull().default("v1"),
  calculadoEm: timestamp("calculado_em", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_score_produto_org").on(t.orgId),
  index("idx_score_produto_risco").on(t.riscoEncalhe),
]);

export const insight = pgTable("insight", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => org.id),
  tipo: text("tipo").notNull(),
  titulo: text("titulo").notNull(),
  conteudo: text("conteudo").notNull(),
  numerosfonte: jsonb("numeros_fonte"),
  confianca: numeric("confianca", { precision: 4, scale: 3 }),
  validoAte: timestamp("valido_ate", { withTimezone: true }),
  modeloUsado: text("modelo_usado"),
  promptVersion: text("prompt_version"),
  createdAt: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_insight_org").on(t.orgId),
  index("idx_insight_tipo").on(t.tipo),
]);

export const sugestaoCampanha = pgTable("sugestao_campanha", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => org.id),
  titulo: text("titulo").notNull(),
  segmentoDescricao: text("segmento_descricao").notNull(),
  oferta: text("oferta").notNull(),
  descontoMinimo: numeric("desconto_minimo", { precision: 5, scale: 2 }),
  status: text("status").notNull().default("sugerida"),
  motivoRejeicao: text("motivo_rejeicao"),
  aprovadoPorId: uuid("aprovado_por_id"),
  expiradoEm: timestamp("expirado_em", { withTimezone: true }),
  modeloUsado: text("modelo_usado"),
  promptVersion: text("prompt_version"),
  createdAt: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("atualizado_em", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_sugestao_org").on(t.orgId),
  index("idx_sugestao_status").on(t.status),
]);

export const llmRun = pgTable("llm_run", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => org.id),
  finalidade: text("finalidade").notNull(),
  modelo: text("modelo").notNull(),
  promptVersion: text("prompt_version"),
  tokensInput: integer("tokens_input"),
  tokensOutput: integer("tokens_output"),
  custoUsd: numeric("custo_usd", { precision: 10, scale: 6 }),
  duracaoMs: integer("duracao_ms"),
  sucesso: text("sucesso").notNull().default("true"),
  erro: text("erro"),
  createdAt: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_llm_org").on(t.orgId),
  index("idx_llm_criado").on(t.createdAt),
]);

export const documentoGerado = pgTable("documento_gerado", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => org.id),
  tipo: text("tipo").notNull(),
  nomeArquivo: text("nome_arquivo").notNull(),
  storageUrl: text("storage_url"),
  dadosOrigem: jsonb("dados_origem"),
  geradoPorId: uuid("gerado_por_id"),
  createdAt: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index("idx_documento_org").on(t.orgId),
]);
