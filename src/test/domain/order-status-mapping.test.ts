import { describe, expect, it, vi } from "vitest";
import { deveAplicarStatusMarketplace, mapearStatusPedido } from "@/modules/canais/domain/order-status";

describe("normalização de status de pedido por canal", () => {
  it.each([
    ["paid", "pago"],
    ["READY_TO_SHIP", "separado"],
    ["PROCESSED", "separado"],
    ["RETRY_SHIP", "separado"],
    ["TO_CONFIRM_RECEIVE", "entregue"],
    ["TO_RETURN", "devolvido"],
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

  // Status novo do canal não pode entrar como pedido normal e sumir no meio da
  // lista: cai em "criado" (o estágio mais conservador) e avisa no log.
  it("trata status desconhecido como criado e deixa rastro", () => {
    const avisos = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(mapearStatusPedido("STATUS_QUE_NAO_EXISTE")).toBe("criado");
    expect(avisos).toHaveBeenCalledTimes(1);
    // Segundo pedido com o mesmo status não repete o aviso.
    expect(mapearStatusPedido("status_que_nao_existe")).toBe("criado");
    expect(avisos).toHaveBeenCalledTimes(1);
    avisos.mockRestore();
  });

  it("aceita saltos progressivos do canal sem regredir por webhook fora de ordem", () => {
    expect(deveAplicarStatusMarketplace("criado", "enviado")).toBe(true);
    expect(deveAplicarStatusMarketplace("entregue", "enviado")).toBe(false);
    expect(deveAplicarStatusMarketplace("concluido", "pago")).toBe(false);
  });

  it("aceita cancelamento tardio e devolução após conclusão, sem reabrir cancelados", () => {
    expect(deveAplicarStatusMarketplace("pago", "cancelado")).toBe(true);
    expect(deveAplicarStatusMarketplace("enviado", "cancelado")).toBe(true);
    expect(deveAplicarStatusMarketplace("concluido", "cancelado")).toBe(true);
    expect(deveAplicarStatusMarketplace("concluido", "devolvido")).toBe(true);
    expect(deveAplicarStatusMarketplace("cancelado", "pago")).toBe(false);
    expect(deveAplicarStatusMarketplace("enviado", "devolvido")).toBe(true);
  });
});
