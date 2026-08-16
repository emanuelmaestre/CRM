import { describe, expect, it } from "vitest";
import { normalizarConsultaPedidos } from "@/modules/vendas/domain/consulta-pedidos";

describe("consulta de pedidos", () => {
  it("normaliza filtros externos para o caso de uso", () => {
    const consulta = normalizarConsultaPedidos({
      brandIds: ["00000000-0000-4000-8000-000000000001"],
      canal: "mercadolivre",
      statuses: ["pago", "entregue"],
      busca: "  pedido 123  ",
      inicio: "2026-08-01T00:00:00-03:00",
      fim: "2026-08-31T23:59:59-03:00",
      offset: 50,
    });

    expect(consulta).toMatchObject({ canal: "mercadolivre", statuses: ["pago", "entregue"], busca: "pedido 123", offset: 50 });
    expect(consulta.inicio).toBeInstanceOf(Date);
    expect(consulta.fim).toBeInstanceOf(Date);
  });

  it("remove filtros vazios e usa offset zero", () => {
    expect(normalizarConsultaPedidos({ brandIds: [], canal: "", busca: "" })).toEqual({ offset: 0 });
  });

  it("rejeita canal, status e identificadores inválidos", () => {
    expect(() => normalizarConsultaPedidos({ canal: "whatsapp" })).toThrow();
    expect(() => normalizarConsultaPedidos({ statuses: ["inventado"] })).toThrow();
    expect(() => normalizarConsultaPedidos({ brandIds: ["não-é-uuid"] })).toThrow();
  });
});
