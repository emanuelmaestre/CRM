import { describe, expect, it } from "vitest";
import {
  calcularDependenciaMidia,
  calcularDesperdicio,
  type ItemAnalisadoDesperdicio,
} from "@/modules/anuncios/application/metricas-calculadas";

/* "Lucro real estimado" e "Break-even" foram removidos daqui — os dois
   dependiam do custo do produto, que nunca existiu no schema (removido num
   refactor anterior) e não será preenchido. Com todo custo sempre nulo, o
   break-even sempre devolvia "indeterminado" e o "lucro" era só receita
   menos investimento com um asterisco de "parcial" que nunca sumiria.
   Decisão de produto: cortar os dois em vez de manter um cálculo que só
   sabe dizer "não sei". */

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
    return { id: "1", nome: "Produto", cliques: 0, gasto: 0, vendas: 0, ...parcial };
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
    expect(resultado.totalEmAtencao).toBe(120);
  });

  it("não sinaliza quem converteu, mesmo com amostra suficiente", () => {
    const resultado = calcularDesperdicio([
      item({ id: "d", cliques: 50, gasto: 300, vendas: 10 }),
    ]);
    expect(resultado.itens).toHaveLength(0);
  });
});
