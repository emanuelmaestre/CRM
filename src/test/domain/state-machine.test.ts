import { describe, it, expect } from "vitest";
import { validarTransicaoPedido, podeCancelar } from "@/modules/vendas/domain/state-machine";

describe("Máquina de estados — Pedido (Invariante nº 7)", () => {
  it("transição válida: criado → pago", () => {
    expect(() => validarTransicaoPedido("criado", "pago")).not.toThrow();
  });

  it("transição válida: pago → separado", () => {
    expect(() => validarTransicaoPedido("pago", "separado")).not.toThrow();
  });

  it("transição válida: enviado → entregue", () => {
    expect(() => validarTransicaoPedido("enviado", "entregue")).not.toThrow();
  });

  it("rejeita transição inválida: criado → entregue", () => {
    expect(() => validarTransicaoPedido("criado", "entregue")).toThrow();
  });

  it("rejeita transição inválida: concluido → qualquer coisa", () => {
    expect(() => validarTransicaoPedido("concluido", "pago")).toThrow();
    expect(() => validarTransicaoPedido("concluido", "cancelado")).toThrow();
  });

  it("rejeita transição inválida: cancelado → pago (estado final)", () => {
    expect(() => validarTransicaoPedido("cancelado", "pago")).toThrow();
  });

  it("podeCancelar retorna true para criado/pago/separado", () => {
    expect(podeCancelar("criado")).toBe(true);
    expect(podeCancelar("pago")).toBe(true);
    expect(podeCancelar("separado")).toBe(true);
  });

  it("podeCancelar retorna false para enviado/entregue/concluido", () => {
    expect(podeCancelar("enviado")).toBe(false);
    expect(podeCancelar("entregue")).toBe(false);
    expect(podeCancelar("concluido")).toBe(false);
  });
});
