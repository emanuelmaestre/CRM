import { describe, expect, it } from "vitest";
import {
  CUSTOS_VAZIOS,
  calcularBreakEven,
  calcularDependenciaMidia,
  calcularDesperdicio,
  calcularLucroReal,
  type ItemAnalisadoDesperdicio,
} from "@/modules/anuncios/application/metricas-calculadas";

describe("Lucro real estimado", () => {
  it("calcula lucro completo quando todos os custos são conhecidos", () => {
    const resultado = calcularLucroReal(1000, 150, 20, {
      custoProdutoUnitario: 25, // 20 × 25 = 500
      comissaoMarketplace: 120,
      impostos: 60,
      frete: 40,
      descontos: 10,
      outros: 0,
    });

    // 1000 - (500+120+60+40+10+0) - 150 = 1000 - 730 - 150 = 120
    expect(resultado.lucroEstimado).toBe(120);
    expect(resultado.margemPercentual).toBe(12);
    expect(resultado.custosIncompletos).toBe(false);
    expect(resultado.custosAusentes).toEqual([]);
  });

  it("nunca trata custo ausente como zero — soma só o que é conhecido e avisa o que falta", () => {
    // Cenário real do sistema hoje: produto.custo não existe no schema.
    const resultado = calcularLucroReal(1000, 150, 20, {
      ...CUSTOS_VAZIOS,
      comissaoMarketplace: 120,
    });

    // 1000 - 120 - 150 = 730 — número real, mas o teste importante é que
    // custosIncompletos existe e nomeia exatamente o que está faltando.
    expect(resultado.lucroEstimado).toBe(730);
    expect(resultado.custosIncompletos).toBe(true);
    expect(resultado.custosAusentes).toEqual([
      "custo do produto", "impostos", "frete", "descontos", "outros custos",
    ]);
  });

  it("margem fica null quando não há receita — não divide por zero", () => {
    const resultado = calcularLucroReal(0, 50, 0, CUSTOS_VAZIOS);
    expect(resultado.margemPercentual).toBeNull();
  });
});

describe("Break-even", () => {
  it("classifica como rentável quando ROAS atual supera o mínimo com folga", () => {
    const resultado = calcularBreakEven(1000, 208, {
      custoProdutoUnitario: 15, unidadesVendidas: 20, // 300
      comissaoMarketplace: 120, impostos: 60, frete: 40, descontos: 10,
    });
    // margem contribuição = (1000-530)/1000 = 0.47 → roasMinimo ≈ 2.13
    expect(resultado.roasMinimo).toBeCloseTo(2.13, 1);
    expect(resultado.roasAtual).toBeCloseTo(4.81, 1); // 1000/208
    expect(resultado.status).toBe("rentavel");
  });

  it("fica indeterminado sem custo do produto conhecido — não inventa break-even", () => {
    const resultado = calcularBreakEven(1000, 200, {
      custoProdutoUnitario: null, unidadesVendidas: 20,
      comissaoMarketplace: 120, impostos: 60, frete: 40, descontos: 10,
    });
    expect(resultado.status).toBe("indeterminado");
    expect(resultado.roasMinimo).toBeNull();
    // ROAS atual ainda é reportável (não depende de custo nenhum) — só o
    // break-even em si que fica indeterminado.
    expect(resultado.roasAtual).toBe(5);
  });

  it("marca não_rentavel quando a margem de contribuição já é negativa antes da mídia", () => {
    const resultado = calcularBreakEven(1000, 100, {
      custoProdutoUnitario: 60, unidadesVendidas: 20, // 1200 > 1000 de receita
      comissaoMarketplace: 0, impostos: 0, frete: 0, descontos: 0,
    });
    expect(resultado.status).toBe("nao_rentavel");
    expect(resultado.roasMinimo).toBeNull();
  });

  it("cai na zona 'no limite' quando o ROAS está raspando o break-even", () => {
    // roasMinimo ≈ 2.0 (margem 50%); roasAtual = 2.05 → dentro de 10%.
    const resultado = calcularBreakEven(1000, 488, {
      custoProdutoUnitario: 0, unidadesVendidas: 20,
      comissaoMarketplace: 500, impostos: 0, frete: 0, descontos: 0,
    });
    expect(resultado.status).toBe("no_limite");
  });
});

describe("Dependência de mídia", () => {
  it("classifica sem julgar automaticamente — dependência alta não é status de erro", () => {
    const resultado = calcularDependenciaMidia(710, 1000);
    expect(resultado.percentual).toBe(71);
    expect(resultado.classificacao).toBe("alta");
  });

  it("fica null sem nenhuma venda no período — não divide por zero", () => {
    expect(calcularDependenciaMidia(0, 0)).toEqual({ percentual: null, classificacao: null });
  });

  it("cobre as quatro faixas sem sobreposição nos limites", () => {
    expect(calcularDependenciaMidia(29, 100).classificacao).toBe("baixa");
    expect(calcularDependenciaMidia(30, 100).classificacao).toBe("moderada");
    expect(calcularDependenciaMidia(55, 100).classificacao).toBe("alta");
    expect(calcularDependenciaMidia(75, 100).classificacao).toBe("critica");
  });
});

describe("Desperdício estimado", () => {
  function item(parcial: Partial<ItemAnalisadoDesperdicio>): ItemAnalisadoDesperdicio {
    return { id: "1", nome: "Produto", cliques: 0, gasto: 0, vendas: 0, roasMinimo: null, roasAtual: null, ...parcial };
  }

  it("não chama de desperdício quem não tem amostra mínima", () => {
    // 5 cliques, R$ 8 de gasto — abaixo dos dois limites (15 cliques / R$30).
    const resultado = calcularDesperdicio([item({ cliques: 5, gasto: 8, vendas: 0 })]);
    expect(resultado.itens).toHaveLength(0);
    expect(resultado.totalEmAtencao).toBe(0);
  });

  it("sinaliza gasto alto sem nenhuma venda, com amostra suficiente", () => {
    const resultado = calcularDesperdicio([
      item({ id: "a", cliques: 40, gasto: 120, vendas: 0 }),
      item({ id: "b", cliques: 100, gasto: 500, vendas: 12 }), // performando bem
    ]);
    expect(resultado.itens.map((i) => i.id)).toEqual(["a"]);
    expect(resultado.itens[0].motivo).toBe("sem_conversao");
    expect(resultado.totalEmAtencao).toBe(120);
  });

  it("sinaliza venda abaixo do break-even mesmo quando converte", () => {
    const resultado = calcularDesperdicio([
      item({ id: "c", cliques: 30, gasto: 200, vendas: 3, roasMinimo: 4, roasAtual: 2.1 }),
    ]);
    expect(resultado.itens[0].motivo).toBe("abaixo_do_breakeven");
  });

  it("não sinaliza quem converte e está acima do break-even", () => {
    const resultado = calcularDesperdicio([
      item({ id: "d", cliques: 50, gasto: 300, vendas: 10, roasMinimo: 3, roasAtual: 5 }),
    ]);
    expect(resultado.itens).toHaveLength(0);
  });
});
