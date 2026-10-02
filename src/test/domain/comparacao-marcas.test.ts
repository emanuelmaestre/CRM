import { describe, expect, it } from "vitest";
import { calcularVantagemPercentualDaLider } from "@/modules/metricas/domain/comparacao-marcas";
import { ordenarComparacao, vantagemComparacao, valorComparacao } from "@/modules/metricas/domain/comparacao-marcas";

describe("comparação entre marcas", () => {
  it("calcula quanto a líder fatura acima da segunda colocada", () => {
    expect(calcularVantagemPercentualDaLider([120, 200, 100])).toBe(67);
  });

  it("mostra estabilidade quando as duas primeiras estão empatadas", () => {
    expect(calcularVantagemPercentualDaLider([200, 200, 100])).toBe(0);
  });

  it("não inventa percentual sem duas bases comparáveis", () => {
    expect(calcularVantagemPercentualDaLider([200])).toBeNull();
    expect(calcularVantagemPercentualDaLider([200, 0])).toBeNull();
  });

  it("usa a mesma liderança no resumo e detalhe, respeitando menor cancelamento", () => {
    const marcas = [
      { marcaLabel: "A", ticketMedio: 200, taxaCancelamento: 4, taxaRecorrencia: null, pedidos: 2 },
      { marcaLabel: "B", ticketMedio: 100, taxaCancelamento: 0, taxaRecorrencia: 50, pedidos: 2 },
      { marcaLabel: "C", ticketMedio: 0, taxaCancelamento: null, taxaRecorrencia: null, pedidos: 0 },
    ];
    expect(ordenarComparacao(marcas, "ticketMedio").map((m) => m.marcaLabel)).toEqual(["A", "B", "C"]);
    expect(ordenarComparacao(marcas, "cancelamento").map((m) => m.marcaLabel)).toEqual(["B", "A", "C"]);
    expect(ordenarComparacao(marcas, "recorrencia")[0].marcaLabel).toBe("B");
    expect(vantagemComparacao(marcas, "cancelamento")).toBe(100);
    expect(valorComparacao(marcas[2], "ticketMedio")).toBeNull();
  });
});
