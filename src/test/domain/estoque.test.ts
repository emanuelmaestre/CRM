import { describe, it, expect } from "vitest";
import { validarMovimento, calcularNovoSaldo } from "@/modules/estoque/domain/entities";

describe("Livro-razão de estoque (Invariante nº 6)", () => {
  it("entrada aumenta saldo", () => {
    expect(calcularNovoSaldo(10, "entrada", 5)).toBe(15);
  });

  it("saida reduz saldo", () => {
    expect(calcularNovoSaldo(10, "saida", 3)).toBe(7);
  });

  it("estorno aumenta saldo", () => {
    expect(calcularNovoSaldo(7, "estorno", 3)).toBe(10);
  });

  it("ajuste substitui saldo", () => {
    expect(calcularNovoSaldo(50, "ajuste", 100)).toBe(100);
  });

  it("rejeita saida com saldo insuficiente (Invariante nº 6)", () => {
    expect(() => validarMovimento(2, "saida", 5)).toThrow("Saldo insuficiente");
  });

  it("rejeita quantidade zero", () => {
    expect(() => validarMovimento(10, "saida", 0)).toThrow("maior que zero");
  });
});
