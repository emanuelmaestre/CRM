import { and, desc, eq, lte } from "drizzle-orm";
import { metricasSnapshotDiario } from "@/shared/lib/db/schema";
import type { CrudContext } from "@/shared/lib/crud-factory";
export { ESCOPO_SNAPSHOT_METRICAS } from "@/modules/metricas/domain/snapshot-scope";

export interface SnapshotMetricas {
  scoreGeral: number | null;
  giroBaixoQtd: number;
  giroBaixoValorParado: number;
  paradosQtd: number;
  paradosValorParado: number;
  reposicaoQtd: number;
  escopoCalculo: string;
}

/** Foto mais recente gravada pelo job A30 até N dias atrás (não exatamente
 *  "N dias atrás": se o job falhar um dia, pega a última disponível antes
 *  do corte, em vez de devolver null e perder a comparação por causa de um
 *  buraco de execução). Null só quando não existe NENHUMA foto até lá —
 *  no primeiro dia após a tabela nascer, por exemplo. */
export async function obterSnapshotAnterior(ctx: CrudContext, diasAtras: number): Promise<SnapshotMetricas | null> {
  const corte = new Date();
  corte.setDate(corte.getDate() - diasAtras);
  const corteIso = corte.toISOString().slice(0, 10);

  const [linha] = await ctx.db
    .select({
      scoreGeral: metricasSnapshotDiario.scoreGeral,
      giroBaixoQtd: metricasSnapshotDiario.giroBaixoQtd,
      giroBaixoValorParado: metricasSnapshotDiario.giroBaixoValorParado,
      paradosQtd: metricasSnapshotDiario.paradosQtd,
      paradosValorParado: metricasSnapshotDiario.paradosValorParado,
      reposicaoQtd: metricasSnapshotDiario.reposicaoQtd,
      escopoCalculo: metricasSnapshotDiario.escopoCalculo,
    })
    .from(metricasSnapshotDiario)
    .where(and(eq(metricasSnapshotDiario.orgId, ctx.orgId), lte(metricasSnapshotDiario.data, corteIso)))
    // A mais RECENTE até o corte — não a mais antiga. `desc` é o que faz
    // "não achou exatamente 30 dias atrás" cair na próxima disponível mais
    // perto, em vez de voltar direto pro primeiro dia que a tabela existe.
    .orderBy(desc(metricasSnapshotDiario.data))
    .limit(1);

  if (!linha) return null;
  return {
    scoreGeral: linha.scoreGeral,
    giroBaixoQtd: linha.giroBaixoQtd,
    giroBaixoValorParado: Number(linha.giroBaixoValorParado),
    paradosQtd: linha.paradosQtd,
    paradosValorParado: Number(linha.paradosValorParado),
    reposicaoQtd: linha.reposicaoQtd,
    escopoCalculo: linha.escopoCalculo,
  };
}

/** Variação percentual de `atual` contra `anterior`. Null quando não há
 *  base (anterior ausente ou zero) — nunca inventa um número quando não
 *  existe divisor. */
export function calcularVariacao(atual: number, anterior: number | null): number | null {
  if (anterior === null || anterior === 0) return null;
  return Math.round(((atual - anterior) / anterior) * 100);
}
