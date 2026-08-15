import { describe, expect, it } from "vitest";
import { diagnosticarCampanha, type DadosDiagnosticoCampanha } from "@/modules/anuncios/application/motor-diagnostico";

function base(parcial: Partial<DadosDiagnosticoCampanha>): DadosDiagnosticoCampanha {
  return {
    impressoes: 0, cliques: 0, vendas: 0, ctr: null, cvr: null,
    cpcAtual: null, cpcAnterior: null, cvrAnterior: null,
    roasAtual: null, roasMinimo: null,
    lostImpressionShareByBudget: null, lostImpressionShareByAdRank: null,
    estoqueDiasCobertura: null,
    ...parcial,
  };
}

describe("motor de diagnóstico — regras diferenciais", () => {
  it("não dispara regra nenhuma sem amostra mínima", () => {
    const achados = diagnosticarCampanha(base({ impressoes: 50, cliques: 3, ctr: 0.001, cvr: 0.001 }));
    expect(achados).toHaveLength(0);
  });

  it("sinaliza muitas impressões com poucos cliques", () => {
    const achados = diagnosticarCampanha(base({ impressoes: 5000, cliques: 10, ctr: 0.002 }));
    expect(achados.map((a) => a.tipo)).toContain("impressoes_altas_cliques_baixos");
  });

  it("sinaliza cliques altos sem venda proporcional", () => {
    const achados = diagnosticarCampanha(base({ cliques: 100, vendas: 1, cvr: 0.005 }));
    expect(achados.map((a) => a.tipo)).toContain("cliques_altos_vendas_baixas");
  });

  it("sinaliza boa conversão com espaço de exposição não capturado", () => {
    const achados = diagnosticarCampanha(base({
      cvr: 0.05, lostImpressionShareByBudget: 0.2, lostImpressionShareByAdRank: 0.15,
    }));
    expect(achados.map((a) => a.tipo)).toContain("conversao_boa_exposicao_baixa");
  });

  it("recomenda escalar quando ROAS é bom e a perda é por orçamento", () => {
    const achados = diagnosticarCampanha(base({ roasAtual: 5, roasMinimo: 3, lostImpressionShareByBudget: 0.25 }));
    const achado = achados.find((a) => a.tipo === "roas_bom_perda_orcamento");
    expect(achado).toBeDefined();
    expect(achado?.severidade).toBe("oportunidade");
    expect(achado?.acaoDesencorajada).toBeUndefined();
  });

  it("NUNCA recomenda aumentar verba quando ROAS está ruim, mesmo com perda por orçamento", () => {
    const achados = diagnosticarCampanha(base({ roasAtual: 1.5, roasMinimo: 3, lostImpressionShareByBudget: 0.3 }));
    const achado = achados.find((a) => a.tipo === "roas_ruim_perda_orcamento");
    expect(achado).toBeDefined();
    expect(achado?.severidade).toBe("critico");
    // O texto exato que o brief exige que o motor saiba dizer.
    expect(achado?.acaoDesencorajada).toMatch(/não aumentar orçamento/i);
    // E a regra de escala (que pediria mais verba) não pode disparar junto.
    expect(achados.some((a) => a.tipo === "roas_bom_perda_orcamento")).toBe(false);
  });

  it("NUNCA recomenda escalar quando o estoque não aguenta, mesmo com ROAS bom", () => {
    const achados = diagnosticarCampanha(base({ roasAtual: 6, roasMinimo: 3, estoqueDiasCobertura: 8 }));
    const achado = achados.find((a) => a.tipo === "roas_bom_estoque_baixo");
    expect(achado).toBeDefined();
    expect(achado?.acaoDesencorajada).toMatch(/não escalar/i);
  });

  it("não sinaliza estoque baixo quando o ROAS não é bom o suficiente pra cogitar escala", () => {
    const achados = diagnosticarCampanha(base({ roasAtual: 2, roasMinimo: 3, estoqueDiasCobertura: 5 }));
    expect(achados.some((a) => a.tipo === "roas_bom_estoque_baixo")).toBe(false);
  });

  it("distingue CPC subindo com CVR estável (investigar leilão) de CVR caindo (investigar produto)", () => {
    const leilao = diagnosticarCampanha(base({ cpcAtual: 3, cpcAnterior: 2, cvr: 0.03, cvrAnterior: 0.031 }));
    expect(leilao.map((a) => a.tipo)).toContain("cpc_subindo_cvr_estavel");
    expect(leilao.map((a) => a.tipo)).not.toContain("cpc_estavel_cvr_caindo");

    const produto = diagnosticarCampanha(base({ cpcAtual: 2.05, cpcAnterior: 2, cvr: 0.02, cvrAnterior: 0.03 }));
    expect(produto.map((a) => a.tipo)).toContain("cpc_estavel_cvr_caindo");
    expect(produto.map((a) => a.tipo)).not.toContain("cpc_subindo_cvr_estavel");
  });

  it("toda recomendação carrega causas possíveis e ação — nunca só 'aumente orçamento' seco", () => {
    const achados = diagnosticarCampanha(base({ roasAtual: 5, roasMinimo: 3, lostImpressionShareByBudget: 0.25 }));
    for (const achado of achados) {
      expect(achado.causasPossiveis.length).toBeGreaterThan(0);
      expect(achado.acaoRecomendada.length).toBeGreaterThan(0);
    }
  });
});
