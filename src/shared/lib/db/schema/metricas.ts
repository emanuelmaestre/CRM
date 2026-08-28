import {
  pgTable, uuid, date, integer, numeric, text, timestamp, uniqueIndex, index,
} from "drizzle-orm/pg-core";
import { org } from "./org";

/** Uma foto por org por dia dos números que hoje só existem "agora" — saldo
 *  de estoque e score da loja são sobrescritos a cada sincronização, sem
 *  deixar rastro do valor de ontem. Sem isso, os cards de Giro baixo,
 *  Parados, Repor em breve e Pontuação da loja não têm como calcular
 *  variação: o dado de comparação nunca existiu no banco. Gravado 1x por
 *  dia pelo job A30 (madrugada); Faturamento e Vendem mais não precisam
 *  disto — eles comparam contra pedidos, que já têm data própria. */
export const metricasSnapshotDiario = pgTable("metricas_snapshot_diario", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => org.id),
  data: date("data").notNull(),
  scoreGeral: integer("score_geral"),
  giroBaixoQtd: integer("giro_baixo_qtd").notNull(),
  giroBaixoValorParado: numeric("giro_baixo_valor_parado", { precision: 12, scale: 2 }).notNull(),
  paradosQtd: integer("parados_qtd").notNull(),
  paradosValorParado: numeric("parados_valor_parado", { precision: 12, scale: 2 }).notNull(),
  reposicaoQtd: integer("reposicao_qtd").notNull(),
  /** Identifica exatamente a régua usada na fotografia. Linhas antigas
   *  recebem `legado`; a UI nunca compara um snapshot com filtro/período
   *  diferente do valor atual. */
  escopoCalculo: text("escopo_calculo").notNull().default("legado"),
  createdAt: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  // Uma foto por org por dia — rodar o job duas vezes no mesmo dia
  // atualiza a mesma linha em vez de duplicar (ver onConflictDoUpdate no job).
  uniqueIndex("uq_metricas_snapshot_org_data").on(t.orgId, t.data),
  index("idx_metricas_snapshot_org").on(t.orgId),
]);
