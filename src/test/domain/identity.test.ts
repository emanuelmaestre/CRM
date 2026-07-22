import { describe, it, expect } from "vitest";
import {
  normalizarTelefone,
  normalizarEmail,
  normalizarCpfCnpj,
  validarCpfCnpj,
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

  it("normaliza e valida CPF/CNPJ antes da deduplicação", () => {
    expect(normalizarCpfCnpj("529.982.247-25")).toBe("52998224725");
    expect(validarCpfCnpj("529.982.247-25")).toBe(true);
    expect(validarCpfCnpj("11.222.333/0001-81")).toBe(true);
    expect(validarCpfCnpj("111.111.111-11")).toBe(false);
  });

  it("score 100 para CPF/CNPJ idêntico", () => {
    const score = calcularScoreDeduplicacao(
      { cpfCnpj: "12345678900" },
      { cpfCnpj: "12345678900" }
    );
    expect(score).toBe(100);
  });

  it("deduplica documento mesmo com máscaras diferentes", () => {
    expect(calcularScoreDeduplicacao(
      { cpfCnpj: "529.982.247-25" },
      { cpfCnpj: "52998224725" },
    )).toBe(100);
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
