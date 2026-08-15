import { and, asc, eq, gte } from "drizzle-orm";
import type { CrudContext } from "@/shared/lib/crud-factory";
import { adsCampanhaSnapshot } from "@/shared/lib/db/schema";

/* ── Histórico (Fase 4 — Apresentação, sub-tela "Histórico") ──────────
   Agrega o snapshot diário (já existente desde a Fase 1) por dia, somando
   todas as campanhas da marca — não por campanha, para a leitura ficar
   legível numa tela só. Hoje (15/08/2026) só existe 1 dia de snapshot real
   por marca, então esta tela nasce com um ponto só — não é bug, é o estado
   real dos dados: o histórico cresce sozinho a cada sincronização diária,
   sem precisar de nenhuma mudança de código quando isso acontecer. */

export interface PontoHistorico {
  data: string;
  investimento: number;
  receita: number;
  cliques: number;
  impressoes: number;
  vendas: number;
  /** Null no dia em que não houve investimento — mesma regra do resto do
   *  módulo, "0" não é "sem dado". */
  roas: number | null;
}

function paraNumero(valor: unknown): number {
  const parsed = Number(valor ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Últimos `dias` de snapshot da marca, um ponto agregado por data,
 *  ordenado do mais antigo para o mais novo (ordem natural de leitura de
 *  um gráfico de tendência). */
export async function obterHistoricoDaMarca(
  ctx: CrudContext,
  opcoes: { brandId: string; dias?: number },
): Promise<PontoHistorico[]> {
  const dias = opcoes.dias ?? 30;
  const dataLimite = new Date();
  dataLimite.setDate(dataLimite.getDate() - dias);
  const dataLimiteStr = dataLimite.toISOString().slice(0, 10);

  const linhas = await ctx.db
    .select({
      data: adsCampanhaSnapshot.data,
      cost: adsCampanhaSnapshot.cost,
      totalAmount: adsCampanhaSnapshot.totalAmount,
      clicks: adsCampanhaSnapshot.clicks,
      prints: adsCampanhaSnapshot.prints,
      unitsQuantity: adsCampanhaSnapshot.unitsQuantity,
    })
    .from(adsCampanhaSnapshot)
    .where(and(
      eq(adsCampanhaSnapshot.orgId, ctx.orgId),
      eq(adsCampanhaSnapshot.brandId, opcoes.brandId),
      gte(adsCampanhaSnapshot.data, dataLimiteStr),
    ))
    .orderBy(asc(adsCampanhaSnapshot.data));

  const porData = new Map<string, PontoHistorico>();
  for (const linha of linhas) {
    const atual = porData.get(linha.data) ?? {
      data: linha.data, investimento: 0, receita: 0, cliques: 0, impressoes: 0, vendas: 0, roas: null,
    };
    atual.investimento = Math.round((atual.investimento + paraNumero(linha.cost)) * 100) / 100;
    atual.receita = Math.round((atual.receita + paraNumero(linha.totalAmount)) * 100) / 100;
    atual.cliques += paraNumero(linha.clicks);
    atual.impressoes += paraNumero(linha.prints);
    atual.vendas += paraNumero(linha.unitsQuantity);
    porData.set(linha.data, atual);
  }

  return [...porData.values()]
    .map((ponto) => ({ ...ponto, roas: ponto.investimento > 0 ? Math.round((ponto.receita / ponto.investimento) * 100) / 100 : null }))
    .sort((a, b) => a.data.localeCompare(b.data));
}
