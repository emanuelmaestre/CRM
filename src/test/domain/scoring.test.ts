import { describe, it, expect } from "vitest";
import { calcularScoreCliente } from "@/modules/scoring/domain/rfm";
import { calcularScoreProduto } from "@/modules/scoring/domain/encalhe";
import { calcularDescontoMinimo } from "@/modules/scoring/domain/desconto-minimo";
import goldenSet from "@/test/fixtures/phase-c-scoring-goldenset.json";

describe("Scoring RFM — fórmulas auditáveis (Camada A, sem IA)", () => {
  it("cliente sem compras há muito tempo tem churn_risk alto", () => {
    const r = calcularScoreCliente({
      diasDesdeUltimaCompra: 180,
      totalCompras: 1,
      valorTotalGasto: 50,
      intervalMedioEntrCompras: null,
    });
    expect(r.churnRisk).toBeGreaterThan(70);
  });

  it("cliente recente e frequente tem churn_risk baixo", () => {
    const r = calcularScoreCliente({
      diasDesdeUltimaCompra: 5,
      totalCompras: 20,
      valorTotalGasto: 5000,
      intervalMedioEntrCompras: 15,
    });
    expect(r.churnRisk).toBeLessThan(30);
  });

  it("churn_risk está entre 0 e 100", () => {
    const extremos = [
      { diasDesdeUltimaCompra: 0, totalCompras: 100, valorTotalGasto: 99999, intervalMedioEntrCompras: 1 },
      { diasDesdeUltimaCompra: 365, totalCompras: 1, valorTotalGasto: 10, intervalMedioEntrCompras: null },
    ];
    for (const d of extremos) {
      const r = calcularScoreCliente(d);
      expect(r.churnRisk).toBeGreaterThanOrEqual(0);
      expect(r.churnRisk).toBeLessThanOrEqual(100);
    }
  });

  it("estimativa de próxima compra é calculada quando há intervalo médio", () => {
    const r = calcularScoreCliente({
      diasDesdeUltimaCompra: 10,
      totalCompras: 5,
      valorTotalGasto: 1000,
      intervalMedioEntrCompras: 30,
    });
    expect(r.proximaCompraEstimadaDias).toBe(20);
  });

  it("versão da fórmula está presente na saída", () => {
    const r = calcularScoreCliente({ diasDesdeUltimaCompra: 30, totalCompras: 3, valorTotalGasto: 300, intervalMedioEntrCompras: null });
    expect(r.versaoFormula).toBe("v2");
  });
});

describe("Scoring Encalhe — fórmulas auditáveis (Camada A, sem IA)", () => {
  it("produto parado há muito tempo tem risco_encalhe alto", () => {
    const r = calcularScoreProduto({ diasSemVenda: 60, giroMensalMedio: 0, saldoAtual: 50, custoUnitario: 30 });
    expect(r.riscoEncalhe).toBeGreaterThan(60);
  });

  it("produto vendendo regularmente tem risco baixo", () => {
    const r = calcularScoreProduto({ diasSemVenda: 3, giroMensalMedio: 20, saldoAtual: 10, custoUnitario: 10 });
    expect(r.riscoEncalhe).toBeLessThan(30);
  });

  it("capital_parado é calculado corretamente", () => {
    const r = calcularScoreProduto({ diasSemVenda: 10, giroMensalMedio: 5, saldoAtual: 100, custoUnitario: 15 });
    expect(r.capitalParado).toBe(1500);
  });

  it("risco entre 0 e 100", () => {
    const r = calcularScoreProduto({ diasSemVenda: 999, giroMensalMedio: 0, saldoAtual: 1000, custoUnitario: 100 });
    expect(r.riscoEncalhe).toBeGreaterThanOrEqual(0);
    expect(r.riscoEncalhe).toBeLessThanOrEqual(100);
  });

  it("agrava queda de tendência e identifica a fórmula v2", () => {
    const estavel = calcularScoreProduto({ diasSemVenda: 15, giroMensalMedio: 4, saldoAtual: 10, custoUnitario: 10, tendenciaVendasPercentual: 0 });
    const queda = calcularScoreProduto({ diasSemVenda: 15, giroMensalMedio: 4, saldoAtual: 10, custoUnitario: 10, tendenciaVendasPercentual: -60 });
    expect(queda.riscoEncalhe).toBeGreaterThan(estavel.riscoEncalhe);
    expect(queda.versaoFormula).toBe("v2");
  });
});

describe("Desconto mínimo e calibração sintética", () => {
  it("nunca ultrapassa o limite de margem", () => {
    const r = calcularDescontoMinimo({
      precoAtual: 100, custoUnitario: 60, margemMinimaPercentual: 20,
      conversaoSemDesconto: 0.02, conversaoComDesconto: 0.04, descontoHistoricoPercentual: 30,
    });
    expect(r.descontoRecomendadoPercentual).toBeLessThanOrEqual(r.descontoMaximoPelaMargemPercentual);
    expect(r.descontoMaximoPelaMargemPercentual).toBe(25);
  });

  it("mantém o golden set dentro das faixas esperadas", () => {
    for (const caso of goldenSet.casos) {
      const resultado = calcularScoreCliente(caso.entrada);
      expect(resultado.churnRisk, caso.nome).toBeGreaterThanOrEqual(caso.churnMinimo);
      expect(resultado.churnRisk, caso.nome).toBeLessThanOrEqual(caso.churnMaximo);
    }
  });
});
