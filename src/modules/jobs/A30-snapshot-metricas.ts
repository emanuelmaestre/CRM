import { sql } from "drizzle-orm";
import { inngest } from "@/shared/lib/inngest/client";
import { db } from "@/shared/lib/db";
import { metricasSnapshotDiario } from "@/shared/lib/db/schema";
import { obterDashboardData } from "@/modules/metricas/application/dashboard.service";
import { obterSaudeLoja } from "@/modules/metricas/application/saude-loja.service";
import { ESCOPO_SNAPSHOT_METRICAS } from "@/modules/metricas/domain/snapshot-scope";
import type { CrudContext } from "@/shared/lib/crud-factory";

function hojeEmSaoPaulo(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

/** A30 — foto diária dos números que hoje não deixam rastro nenhum no banco.
 *
 *  Giro baixo, Parados, Repor em breve e Pontuação da loja dependem do
 *  saldo de estoque (sobrescrito a cada sincronização, sem histórico — ver
 *  `estoque_canal_saldo`) e do score da loja (nunca persistido). Sem uma
 *  foto de "como estava ontem", esses 4 cards do mosaico de Métricas não
 *  têm como calcular variação — o dado de comparação simplesmente nunca
 *  existiu. Faturamento e Vendem mais não precisam disto: comparam contra
 *  pedidos, que já carregam data própria.
 *
 *  A fotografia usa exatamente a visão inicial do mosaico: todas as marcas,
 *  Mercado Livre e o dia corrente. O identificador do escopo é persistido
 *  junto dos números; se a pessoa mudar marca, canal ou período, a UI não
 *  compara grandezas diferentes. */
export const A30_snapshotMetricas = inngest.createFunction(
  {
    id: "A30-snapshot-metricas",
    name: "A30 — Foto diária de estoque e score para comparação histórica",
    concurrency: { limit: 1 },
    triggers: [{ cron: "30 2 * * *" }],
  },
  async ({ step }) => {
    const orgId = process.env.DEFAULT_ORG_ID ?? "";
    const ctx: CrudContext = { db, orgId, perfil: "admin" };
    const hoje = hojeEmSaoPaulo();
    const filtros = { inicio: hoje, fim: hoje, canal: ["mercadolivre"] };

    const dashboard = await step.run("obter-dashboard", () => obterDashboardData(ctx, filtros));
    const saude = await step.run("obter-saude-loja", () => obterSaudeLoja(ctx, {
      inicio: hoje,
      fim: hoje,
      canais: ["mercadolivre"],
    }));

    const linha = {
      orgId,
      data: hoje,
      scoreGeral: saude.scoreGeral !== null ? Math.round(saude.scoreGeral) : null,
      giroBaixoQtd: dashboard.giroBaixoTotal,
      giroBaixoValorParado: dashboard.giroBaixoValorParadoNumerico.toFixed(2),
      paradosQtd: dashboard.paradosTotal,
      paradosValorParado: dashboard.paradosValorParadoNumerico.toFixed(2),
      reposicaoQtd: dashboard.reposicaoTotal,
      escopoCalculo: ESCOPO_SNAPSHOT_METRICAS,
    };

    // Rodar o job de novo no mesmo dia (reprocessamento manual, retry) atualiza
    // a mesma linha em vez de duplicar — a foto do dia é sempre a mais recente.
    await step.run("gravar-snapshot", () =>
      db
        .insert(metricasSnapshotDiario)
        .values(linha)
        .onConflictDoUpdate({
          target: [metricasSnapshotDiario.orgId, metricasSnapshotDiario.data],
          set: {
            scoreGeral: sql`excluded.score_geral`,
            giroBaixoQtd: sql`excluded.giro_baixo_qtd`,
            giroBaixoValorParado: sql`excluded.giro_baixo_valor_parado`,
            paradosQtd: sql`excluded.parados_qtd`,
            paradosValorParado: sql`excluded.parados_valor_parado`,
            reposicaoQtd: sql`excluded.reposicao_qtd`,
            escopoCalculo: sql`excluded.escopo_calculo`,
          },
        })
    );

    return linha;
  }
);
