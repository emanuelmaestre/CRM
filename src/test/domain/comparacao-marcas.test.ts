import { describe, expect, it } from "vitest";
import { calcularVantagemPercentualDaLider } from "@/modules/metricas/domain/comparacao-marcas";

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
});
