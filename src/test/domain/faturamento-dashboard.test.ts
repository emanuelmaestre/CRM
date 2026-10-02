import { describe, expect, it } from "vitest";
import { obterDashboardData } from "@/modules/metricas/application/dashboard.service";
import type { CrudContext } from "@/shared/lib/crud-factory";

describe("faturamento do dashboard", () => {
  it.each(["2026-09-03", "2026-11-29"])("mantém série, ticket e comparação na mesma base financeira até %s", async (fim) => {
    const base = { original: 100, confirmado: 80, faturavel: true, frete: "5",
      valorLiquido: null, dadosOrigem: { pagamentos: [{ reembolsado: 20 }] } };
    const respostas = [
      [
        { ...base, id: "atual", total: 95, createdAt: new Date("2026-09-02T12:00:00-03:00") },
        { ...base, id: "cancelado", total: 100, faturavel: false, createdAt: new Date("2026-09-03T12:00:00-03:00") },
        { ...base, id: "anterior", total: 100, createdAt: new Date("2026-08-31T12:00:00-03:00") },
      ],
      [{ pedidoId: "atual", taxa: "10" }, { pedidoId: "anterior", taxa: "10" }],
      [], [], [],
    ];
    let consulta = 0;
    const db = { select() {
      const resposta = respostas[consulta++];
      const resultado = Promise.resolve(resposta);
      const builder = {
        from: () => builder, where: () => builder, innerJoin: () => builder,
        groupBy: () => builder, then: resultado.then.bind(resultado),
      };
      return builder;
    } };
    const { faturamento: f } = await obterDashboardData({ orgId: "org", db } as unknown as CrudContext,
      { inicio: "2026-09-01", fim, canal: ["shopee", "tiktokshop"] });
    expect(f.totalNumerico).toBe(195);
    expect(f.totalLiquidoNumerico).toBe(65);
    expect(f.totalAnteriorNumerico).toBe(100);
    expect(f.totalAnteriorLiquidoNumerico).toBe(65);
    expect(f.pedidos).toBe(2);
    expect(f.variacaoPercentual).toBe(95);
    expect(f.variacaoPercentualLiquido).toBe(0);
    expect(f.serie.reduce((s, p) => s + p.valor, 0)).toBe(f.totalNumerico);
    expect(f.serieLiquido.reduce((s, p) => s + p.valor, 0)).toBe(f.totalLiquidoNumerico);
    expect(f.composicao?.ajustesBaseNumerico).toBe(5);
    expect(f.composicao?.canceladosDevolvidosNumerico).toBe(100);
    expect(f.composicao?.reembolsosParciaisNumerico).toBe(20);
    expect(f.liquidoEstimadosQtd).toBe(1);
  });
});
