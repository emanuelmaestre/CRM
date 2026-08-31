import { describe, expect, it } from "vitest";
import { consolidarDesempenhoML, periodoAnteriorML, periodoDesempenhoML, variacaoDesempenhoML } from "@/modules/vendas/domain/desempenho-mercadolivre";

describe("desempenho do Mercado Livre", () => {
  it("calcula médias ponderadas e conversão do conjunto de lojas, com centavos exatos", () => {
    const resumo = consolidarDesempenhoML([
      { vendasBrutas: 100.1, unidadesVendidas: 2, quantidadeVendas: 1, vendasCanceladas: 0, visitas: 10 },
      { vendasBrutas: 200.2, unidadesVendidas: 8, quantidadeVendas: 3, vendasCanceladas: 1, visitas: 90 },
    ]);
    expect(resumo).toEqual({ vendasBrutas: 300.3, unidadesVendidas: 10, quantidadeVendas: 4, vendasCanceladas: 1, visitas: 100, precoMedioUnidade: 30.03, precoMedioVenda: 75.075, conversao: 4 });
  });

  it("não publica visita parcial como total, nem inventa unidades faltantes", () => {
    const resumo = consolidarDesempenhoML([
      { vendasBrutas: 50, unidadesVendidas: null, quantidadeVendas: 1, vendasCanceladas: 0, visitas: 10 },
      { vendasBrutas: 100, unidadesVendidas: 2, quantidadeVendas: 1, vendasCanceladas: 1, visitas: null },
    ]);
    expect(resumo).toMatchObject({ vendasBrutas: 150, quantidadeVendas: 2, unidadesVendidas: null, precoMedioUnidade: null, visitas: null, conversao: null, precoMedioVenda: 75 });
  });

  it("distingue zeros reais de médias sem denominador", () => {
    expect(consolidarDesempenhoML([{ vendasBrutas: 0, unidadesVendidas: 0, quantidadeVendas: 0, vendasCanceladas: 0, visitas: 0 }]))
      .toMatchObject({ vendasBrutas: 0, visitas: 0, precoMedioUnidade: null, precoMedioVenda: null, conversao: null });
    expect(consolidarDesempenhoML([{ vendasBrutas: 0, unidadesVendidas: 0, quantidadeVendas: 0, vendasCanceladas: 0, visitas: 25 }]).conversao).toBe(0);
  });

  it("compara dias completos adjacentes sem perder o milissegundo da fronteira", () => {
    const periodo = periodoAnteriorML(new Date("2026-08-24T03:00:00Z"), new Date("2026-08-31T02:59:59.999Z"));
    expect(periodo.inicio.toISOString()).toBe("2026-08-17T03:00:00.000Z");
    expect(periodo.fim.toISOString()).toBe("2026-08-24T02:59:59.999Z");
  });

  it("alinha o calendário das visitas e vendas sem confundir o fim UTC com o dia brasileiro", () => {
    const periodo = periodoDesempenhoML(new Date("2026-08-30T03:00:00Z"), new Date("2026-08-31T02:59:59.999Z"));
    expect(periodo.dataInicio).toBe("2026-08-30");
    expect(periodo.dataFim).toBe("2026-08-30");
    expect(periodo.inicio.toISOString()).toBe("2026-08-30T04:00:00.000Z");
    expect(periodo.fim.toISOString()).toBe("2026-08-31T03:59:59.999Z");
    expect(periodoAnteriorML(periodo.inicio, periodo.fim).fim.toISOString()).toBe("2026-08-30T03:59:59.999Z");
  });

  it("não divide por zero nas variações e usa pontos percentuais na conversão", () => {
    expect(variacaoDesempenhoML(100, 0)).toBeNull();
    expect(variacaoDesempenhoML(0, 0)).toBe(0);
    expect(variacaoDesempenhoML(null, 100)).toBeNull();
    expect(variacaoDesempenhoML(150, 100)).toBe(50);
    expect(variacaoDesempenhoML(0, 100)).toBe(-100);
    expect(variacaoDesempenhoML(4.2, 4.7, true)).toBeCloseTo(-0.5);
  });
});
