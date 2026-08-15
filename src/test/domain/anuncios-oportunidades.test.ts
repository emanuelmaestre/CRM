import { describe, expect, it } from "vitest";
import {
  identificarOportunidades,
  identificarOportunidadeEscala,
  identificarOportunidadePorOrcamento,
  identificarOportunidadeRanking,
  identificarOportunidadeRecuperacao,
  type DadosOportunidadeCampanha,
} from "@/modules/anuncios/application/oportunidades";

function base(parcial: Partial<DadosOportunidadeCampanha>): DadosOportunidadeCampanha {
  return {
    campanhaId: "camp-1",
    campanhaNome: "Campanha Teste",
    roasAtual: null,
    roasMinimo: null,
    roasAnterior: null,
    cvr: null,
    gastoAtual: 0,
    lucroEstimado: null,
    estoqueDiasCobertura: null,
    lostImpressionShareByBudget: null,
    lostImpressionShareByAdRank: null,
    cliques: 50, // acima do mínimo por padrão; testes de amostra sobrescrevem
    ...parcial,
  };
}

describe("Radar de Oportunidades", () => {
  it("identifica oportunidade de escala: ROAS bom + perda relevante por orçamento", () => {
    const oportunidade = identificarOportunidadeEscala(base({
      roasAtual: 5, roasMinimo: 3, lostImpressionShareByBudget: 0.2, cvr: 0.03,
    }));
    expect(oportunidade).not.toBeNull();
    expect(oportunidade?.tipo).toBe("escala");
    expect(oportunidade?.criterios.length).toBeGreaterThan(0);
  });

  it("não identifica escala sem amostra mínima de cliques", () => {
    const oportunidade = identificarOportunidadeEscala(base({
      cliques: 5, roasAtual: 5, roasMinimo: 3, lostImpressionShareByBudget: 0.2,
    }));
    expect(oportunidade).toBeNull();
  });

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

  it("oportunidade por orçamento exige campanha já rentável, não só perda alta", () => {
    const semLucro = identificarOportunidadePorOrcamento(base({
      lostImpressionShareByBudget: 0.4, lostImpressionShareByAdRank: 0.05,
      roasAtual: 1.5, roasMinimo: 3, // não rentável
    }));
    expect(semLucro).toBeNull();

    const rentavel = identificarOportunidadePorOrcamento(base({
      lostImpressionShareByBudget: 0.4, lostImpressionShareByAdRank: 0.05,
      roasAtual: 5, roasMinimo: 3, gastoAtual: 100,
    }));
    expect(rentavel?.tipo).toBe("orcamento");
    // A estimativa de impacto precisa vir marcada como estimativa, nunca garantia.
    expect(rentavel?.explicacao).toMatch(/estimativa/i);
  });

  it("identificarOportunidades ordena por score de impacto, maior primeiro", () => {
    const lista = identificarOportunidades(base({
      roasAtual: 6, roasMinimo: 3, lostImpressionShareByBudget: 0.3,
      lucroEstimado: 500, gastoAtual: 200, cvr: 0.04,
    }));
    for (let i = 1; i < lista.length; i += 1) {
      expect(lista[i - 1].scoreImpacto).toBeGreaterThanOrEqual(lista[i].scoreImpacto);
    }
  });

  it("nenhuma oportunidade dispara com dados totalmente vazios", () => {
    expect(identificarOportunidades(base({}))).toHaveLength(0);
  });
});
