import { describe, expect, it } from "vitest";
import { liquidoDoPedido, liquidoFoiInformado } from "@/modules/vendas/domain/liquido-pedido";

/* O que estes testes protegem: até 28/08/2026 o faturamento líquido de
   Métricas era SEMPRE a estimativa `total - taxas - frete`, mesmo depois de a
   Shopee passar a entregar o repasse real. Sobre os 1.009 pedidos já
   reconciliados, isso somava R$ 2.717,86 de lucro inexistente. O risco de
   regressão é alto porque a estimativa nunca falha nem parece errada — ela só
   dá um número otimista, calado. */
describe("liquidoDoPedido", () => {
  it("usa o repasse do canal quando ele existe, ignorando a estimativa", () => {
    // Números reais do pedido WUWU 2608233VDDB83W: bruto 15,90, líquido 7,91.
    // A estimativa daria 15,90 - 4,00 - 0 = 11,90 — quase 50% a mais.
    expect(liquidoDoPedido({
      total: "15.90", frete: "0.00", valorLiquido: "7.91", taxasConhecidas: 4,
    })).toBe(7.91);
  });

  it("cai na estimativa quando o canal não informa repasse (Mercado Livre)", () => {
    expect(liquidoDoPedido({
      total: "100.00", frete: "10.00", valorLiquido: null, taxasConhecidas: 12,
    })).toBe(78);
  });

  it("trata frete ausente como zero em vez de virar NaN", () => {
    // `frete` é nullable no schema e chega null em pedido de canal manual.
    expect(liquidoDoPedido({
      total: "50.00", frete: null, valorLiquido: null, taxasConhecidas: 0,
    })).toBe(50);
  });

  it("respeita repasse zero, que é diferente de repasse desconhecido", () => {
    // Um pedido cujo escrow fechou em 0,00 (tudo consumido por tarifas) não
    // pode cair na estimativa e reaparecer como lucro.
    expect(liquidoDoPedido({
      total: "30.00", frete: "0.00", valorLiquido: "0.00", taxasConhecidas: 5,
    })).toBe(0);
  });

  it("aceita repasse negativo — a Shopee devolve isso em pedido com reversa", () => {
    expect(liquidoDoPedido({
      total: "20.00", frete: "0.00", valorLiquido: "-3.50", taxasConhecidas: 0,
    })).toBe(-3.5);
  });
});

describe("liquidoFoiInformado", () => {
  it("distingue repasse do canal de estimativa nossa", () => {
    expect(liquidoFoiInformado("7.91")).toBe(true);
    expect(liquidoFoiInformado("0.00")).toBe(true);
    expect(liquidoFoiInformado(null)).toBe(false);
    expect(liquidoFoiInformado(undefined)).toBe(false);
  });
});
