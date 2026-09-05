import { describe, it, expect } from "vitest";
import { marcarEvidenciaPagamento } from "@/modules/vendas/domain/status-faturamento";

describe("cancelamentos sem evidência", () => {
  it("não converte informação ausente em negativa", () => {
    expect(marcarEvidenciaPagamento({ motivoCancelamento: "Outros" }, "cancelado"))
      .not.toHaveProperty("pagamentoAprovado");
  });
  it("preserva negativas explícitas", () => {
    expect(marcarEvidenciaPagamento({ pagamentoAprovado: false }, "cancelado"))
      .toMatchObject({ pagamentoAprovado: false });
  });
  it("preserva aprovação anterior apesar de payload incompleto", () => {
    expect(marcarEvidenciaPagamento({}, "cancelado", true))
      .toMatchObject({ pagamentoAprovado: true });
  });
});
