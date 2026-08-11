import { describe, it, expect } from "vitest";
import { validarMovimento, calcularNovoSaldo, CreateProdutoSchema } from "@/modules/estoque/domain/entities";
import {
  minimoPelaRegua, FAIXAS_GIRO_PADRAO, type ReguaEstoque,
} from "@/modules/estoque/application/estoque.service";

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

  it("normaliza SKU e moeda na entrada do catálogo", () => {
    const produto = CreateProdutoSchema.parse({
      brandId: "10000000-0000-4000-8000-000000000001",
      sku: " kz-001 ", nome: "Produto teste", preco: "19,90", ativo: true,
    });
    expect(produto.sku).toBe("KZ-001");
    expect(produto.preco).toBe("19.90");
  });

  it("rejeita preço zerado", () => {
    expect(() => CreateProdutoSchema.parse({
      brandId: "10000000-0000-4000-8000-000000000001",
      sku: "KZ-002", nome: "Produto teste", preco: "0", ativo: true,
    })).toThrow("Preço deve ser maior que zero");
  });
});

describe("Régua de estoque mínimo", () => {
  const porGiro: ReguaEstoque = { tipo: "giro", faixas: FAIXAS_GIRO_PADRAO };

  it("régua fixa ignora o giro", () => {
    const fixa: ReguaEstoque = { tipo: "fixo", minimo: 5 };
    expect(minimoPelaRegua(fixa, 0)).toBe(5);
    expect(minimoPelaRegua(fixa, 250)).toBe(5);
  });

  it("mínimo acompanha a faixa de giro alcançada", () => {
    expect(minimoPelaRegua(porGiro, 40)).toBe(12);
    expect(minimoPelaRegua(porGiro, 10)).toBe(12);
    expect(minimoPelaRegua(porGiro, 5)).toBe(4);
    expect(minimoPelaRegua(porGiro, 3)).toBe(4);
    expect(minimoPelaRegua(porGiro, 1)).toBe(2);
  });

  it("giro fracionário cai na faixa de baixo, não arredonda para cima", () => {
    // 2,9/mês não é "3 ou mais": subir de faixa aqui inflaria o mínimo de
    // quem vende pouco, que é exatamente quem não deve prender capital.
    expect(minimoPelaRegua(porGiro, 2.9)).toBe(2);
    expect(minimoPelaRegua(porGiro, 0.9)).toBe(0);
  });

  it("sem giro não gera alerta", () => {
    expect(minimoPelaRegua(porGiro, 0)).toBe(0);
  });

  it("decide igual independente da ordem em que as faixas chegam", () => {
    const desordenada: ReguaEstoque = {
      tipo: "giro",
      faixas: [
        { vendaMensalMinima: 1, minimo: 2 },
        { vendaMensalMinima: 10, minimo: 12 },
        { vendaMensalMinima: 0, minimo: 0 },
        { vendaMensalMinima: 3, minimo: 4 },
      ],
    };
    for (const giro of [0, 0.5, 1, 2.9, 3, 9.9, 10, 40]) {
      expect(minimoPelaRegua(desordenada, giro)).toBe(minimoPelaRegua(porGiro, giro));
    }
  });

  it("sem faixa que o giro alcance, não alerta em vez de estourar", () => {
    const soAltoGiro: ReguaEstoque = { tipo: "giro", faixas: [{ vendaMensalMinima: 100, minimo: 50 }] };
    expect(minimoPelaRegua(soAltoGiro, 5)).toBe(0);
    expect(minimoPelaRegua(soAltoGiro, 100)).toBe(50);
  });
});
