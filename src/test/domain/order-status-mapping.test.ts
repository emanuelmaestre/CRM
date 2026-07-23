import { describe, expect, it } from "vitest";
import { deveAplicarStatusMarketplace, mapearStatusPedido } from "@/modules/canais/domain/order-status";

describe("normalização de status de pedido por canal", () => {
  it.each([
    ["paid", "pago"],
    ["READY_TO_SHIP", "separado"],
    ["AWAITING_SHIPMENT", "pago"],
    ["approved", "pago"],
    ["invoiced", "separado"],
    ["collected", "enviado"],
    ["partially_returned", "devolvido"],
    ["delivered", "entregue"],
    ["cancelled", "cancelado"],
  ])("mapeia %s para %s", (external, expected) => {
    expect(mapearStatusPedido(external)).toBe(expected);
  });

  it("aceita saltos progressivos do canal sem regredir por webhook fora de ordem", () => {
    expect(deveAplicarStatusMarketplace("criado", "enviado")).toBe(true);
    expect(deveAplicarStatusMarketplace("entregue", "enviado")).toBe(false);
    expect(deveAplicarStatusMarketplace("concluido", "pago")).toBe(false);
  });

  it("aplica cancelamento antes do envio e devolução depois do envio", () => {
    expect(deveAplicarStatusMarketplace("pago", "cancelado")).toBe(true);
    expect(deveAplicarStatusMarketplace("enviado", "cancelado")).toBe(false);
    expect(deveAplicarStatusMarketplace("enviado", "devolvido")).toBe(true);
  });
});
