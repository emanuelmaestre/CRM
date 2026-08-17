import { describe, expect, it } from "vitest";
import {
  identificarOportunidades,
  identificarOportunidadeRanking,
  identificarOportunidadeRecuperacao,
  type DadosOportunidadeCampanha,
} from "@/modules/anuncios/application/oportunidades";

function base(parcial: Partial<DadosOportunidadeCampanha>): DadosOportunidadeCampanha {
  return {
    campanhaId: "camp-1",
    campanhaNome: "Campanha Teste",
    roasAtual: null,
    roasAnterior: null,
    cvr: null,
    gastoAtual: 0,
    estoqueDiasCobertura: null,
    lostImpressionShareByBudget: null,
    lostImpressionShareByAdRank: null,
    cliques: 50, // acima do mínimo por padrão; testes de amostra sobrescrevem
    ...parcial,
  };
}

/* "Escala" e "Por orçamento" saíram — as duas exigiam `roasMinimo` (o
   break-even, calculado a partir do custo do produto) para chamar a
   campanha de "rentável". O custo nunca existiu no schema, então nenhuma
   das duas jamais disparou em produção. */

describe("Radar de Oportunidades", () => {
  it("identifica recuperação quando o ROAS caiu de forma relevante", () => {
    const oportunidade = identificarOportunidadeRecuperacao(base({ roasAnterior: 5.7, roasAtual: 3.4 }));
    expect(oportunidade?.tipo).toBe("recuperacao");
    expect(oportunidade?.explicacao).toContain("5.70x");
  });

  it("não identifica recuperação numa queda pequena (ruído normal)", () => {
    const oportunidade = identificarOportunidadeRecuperacao(base({ roasAnterior: 5.0, roasAtual: 4.7 }));
    expect(oportunidade).toBeNull();
  });

  it("identifica gargalo de ranking só quando ranking supera orçamento como causa", () => {
    const oportunidade = identificarOportunidadeRanking(base({
      lostImpressionShareByAdRank: 0.3, lostImpressionShareByBudget: 0.1,
    }));
    expect(oportunidade?.tipo).toBe("ranking");
    // A recomendação nunca pode ser sobre orçamento aqui.
    expect(oportunidade?.explicacao.toLowerCase()).not.toContain("aumentar orçamento");
  });

  it("não confunde ranking com orçamento quando orçamento é a causa maior", () => {
    const oportunidade = identificarOportunidadeRanking(base({
      lostImpressionShareByAdRank: 0.2, lostImpressionShareByBudget: 0.35,
    }));
    expect(oportunidade).toBeNull();
  });

  it("identificarOportunidades ordena por score de impacto, maior primeiro", () => {
    const lista = identificarOportunidades(base({
      roasAnterior: 6, roasAtual: 3, gastoAtual: 200, cvr: 0.04,
    }));
    for (let i = 1; i < lista.length; i += 1) {
      expect(lista[i - 1].scoreImpacto).toBeGreaterThanOrEqual(lista[i].scoreImpacto);
    }
  });

  it("nenhuma oportunidade dispara com dados totalmente vazios", () => {
    expect(identificarOportunidades(base({}))).toHaveLength(0);
  });
});
