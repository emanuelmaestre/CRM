import { describe, it, expect } from "vitest";
import {
  normalizarTelefone,
  normalizarEmail,
  calcularScoreDeduplicacao,
  classificarDeduplicacao,
} from "@/modules/clientes/domain/identity";

describe("Motor de identidade — deduplicação", () => {
  it("normaliza telefone brasileiro para E.164", () => {
    expect(normalizarTelefone("11999999999")).toBe("+5511999999999");
    expect(normalizarTelefone("(11) 99999-9999")).toBe("+5511999999999");
    expect(normalizarTelefone("+5511999999999")).toBe("+5511999999999");
  });

  it("normaliza e-mail para lowercase", () => {
    expect(normalizarEmail("TESTE@EXEMPLO.COM")).toBe("teste@exemplo.com");
    expect(normalizarEmail("  usuario@dominio.com.br  ")).toBe("usuario@dominio.com.br");
  });

  it("score 100 para CPF/CNPJ idêntico", () => {
    const score = calcularScoreDeduplicacao(
      { cpfCnpj: "12345678900" },
      { cpfCnpj: "12345678900" }
    );
    expect(score).toBe(100);
  });

  it("score 80 para e-mail idêntico", () => {
    const score = calcularScoreDeduplicacao(
      { email: "a@b.com" },
      { email: "a@b.com" }
    );
    expect(score).toBe(80);
  });

  it("score 0 para sem correspondência", () => {
    const score = calcularScoreDeduplicacao(
      { email: "a@b.com" },
      { email: "x@y.com" }
    );
    expect(score).toBe(0);
  });

  it("classifica corretamente", () => {
    expect(classificarDeduplicacao(100)).toBe("exato");
    expect(classificarDeduplicacao(80)).toBe("exato");
    expect(classificarDeduplicacao(40)).toBe("possivel");
    expect(classificarDeduplicacao(0)).toBe("novo");
  });
});
