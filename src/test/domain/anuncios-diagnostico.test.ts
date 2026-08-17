import { describe, expect, it } from "vitest";
import { diagnosticarCampanha, type DadosDiagnosticoCampanha } from "@/modules/anuncios/application/motor-diagnostico";

function base(parcial: Partial<DadosDiagnosticoCampanha>): DadosDiagnosticoCampanha {
  return {
    impressoes: 0, cliques: 0, vendas: 0, ctr: null, cvr: null,
    cpcAtual: null, cpcAnterior: null, cvrAnterior: null,
    roasAtual: null,
    lostImpressionShareByBudget: null, lostImpressionShareByAdRank: null,
    estoqueDiasCobertura: null,
    ...parcial,
  };
}

/* As regras "roas_bom_perda_orcamento", "roas_ruim_perda_orcamento" e
   "roas_bom_estoque_baixo" saíram do motor — as três exigiam `roasMinimo`
   (o break-even, calculado a partir do custo do produto). O custo nunca
   existiu no schema, então as três nunca dispararam em produção. O motor
   fica só com regras que dependem apenas do funil, que o Mercado Livre
   entrega pronto. */

describe("motor de diagnóstico — regras de funil", () => {
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

  it("distingue CPC subindo com CVR estável (investigar leilão) de CVR caindo (investigar produto)", () => {
    const leilao = diagnosticarCampanha(base({ cpcAtual: 3, cpcAnterior: 2, cvr: 0.03, cvrAnterior: 0.031 }));
    expect(leilao.map((a) => a.tipo)).toContain("cpc_subindo_cvr_estavel");
    expect(leilao.map((a) => a.tipo)).not.toContain("cpc_estavel_cvr_caindo");

    const produto = diagnosticarCampanha(base({ cpcAtual: 2.05, cpcAnterior: 2, cvr: 0.02, cvrAnterior: 0.03 }));
    expect(produto.map((a) => a.tipo)).toContain("cpc_estavel_cvr_caindo");
    expect(produto.map((a) => a.tipo)).not.toContain("cpc_subindo_cvr_estavel");
  });

  it("toda recomendação carrega causas possíveis e ação — nunca só um título seco", () => {
    const achados = diagnosticarCampanha(base({
      cvr: 0.05, lostImpressionShareByBudget: 0.2, lostImpressionShareByAdRank: 0.15,
    }));
    expect(achados.length).toBeGreaterThan(0);
    for (const achado of achados) {
      expect(achado.causasPossiveis.length).toBeGreaterThan(0);
      expect(achado.acaoRecomendada.length).toBeGreaterThan(0);
    }
  });
});
