import { describe, expect, it } from "vitest";
import { calcularComposicaoFaturamento } from "@/modules/metricas/domain/composicao-faturamento";

describe("composição do faturamento", () => {
  it("preserva o faturamento válido e soma cancelamentos apenas no bruto explicativo", () => {
    expect(calcularComposicaoFaturamento(75_120.44, 3_400.15, 161)).toEqual({
      pedidosBrutosNumerico: 78_681.59,
      canceladosDevolvidosNumerico: 3_561.15,
      reembolsosParciaisNumerico: 0,
      faturamentoValidoNumerico: 75_120.44,
    });
  });

  it("arredonda em centavos para evitar resíduo de ponto flutuante", () => {
    expect(calcularComposicaoFaturamento(0.1, 0.2, 0).pedidosBrutosNumerico).toBe(0.3);
  });

  it("recompõe o bruto somando o reembolso parcial abatido", () => {
    expect(calcularComposicaoFaturamento(60_791.17, 2_595.21, 0, 121.39)).toMatchObject({
      pedidosBrutosNumerico: 63_507.77,
      reembolsosParciaisNumerico: 121.39,
    });
  });
});
