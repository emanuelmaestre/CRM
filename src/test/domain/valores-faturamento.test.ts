import { describe, expect, it } from "vitest";
import { valoresFaturamento } from "@/modules/metricas/domain/valores-faturamento";

const venda = { bruto: 100, original: 100, confirmado: 80, faturavel: true,
  frete: 5, taxasConhecidas: 10, valorLiquido: null,
  dadosOrigem: { pagamentos: [{ reembolsado: 20 }] } };

describe("bruto oficial e líquido das mesmas vendas", () => {
  it("preserva o bruto e desconta reembolso, taxas e frete somente na estimativa", () => {
    expect(valoresFaturamento(venda)).toEqual({ bruto: 100, receita: 80,
      reembolso: 20, ajusteBase: 0, canceladoDevolvido: 0, liquido: 65 });
  });
  it("não desconta novamente taxas ou reembolsos do repasse informado, inclusive zero", () => {
    expect(valoresFaturamento({ ...venda, valorLiquido: "62.50" }).liquido).toBe(62.5);
    expect(valoresFaturamento({ ...venda, valorLiquido: "0" }).liquido).toBe(0);
  });
  it("mantém cancelados no bruto e fora da receita e do líquido", () => {
    expect(valoresFaturamento({ ...venda, faturavel: false, valorLiquido: "90" }))
      .toEqual({ bruto: 100, receita: 0, reembolso: 0, ajusteBase: 0, canceladoDevolvido: 100, liquido: 0 });
  });
  it("explica a diferença entre GMV e valor financeiro sem chamá-la de reembolso", () => {
    const r = valoresFaturamento({ ...venda, bruto: 95 });
    expect(r.ajusteBase).toBe(5);
    expect(r.bruto - r.canceladoDevolvido - r.reembolso + r.ajusteBase).toBe(r.receita);
  });
});
