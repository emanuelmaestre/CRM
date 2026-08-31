import { describe, expect, it } from "vitest";
import {
  decomporPedido,
  emCentavos,
  precisaResolver,
  type PedidoConferencia,
} from "@/modules/vendas/domain/auditoria-financeira";

/* O que estes testes protegem: a conferência da somatória dos elementos contra
   o valor bruto que a API dona daquele número informou. Cada canal mede o
   bruto de um jeito (ML: só produtos; Shopee: o que o comprador pagou), então
   a regra de decomposição é por canal e não pode vazar de um para o outro. */

function pedido(over: Partial<PedidoConferencia>): PedidoConferencia {
  return {
    canal: "mercadolivre",
    total: "0",
    itens: [],
    idadeDias: 30,
    ...over,
  };
}

describe("decomporPedido — Mercado Livre", () => {
  it("fecha quando a soma dos itens bate com o total (order.total_amount)", () => {
    const d = decomporPedido(pedido({
      canal: "mercadolivre",
      total: "150.00",
      itens: [{ precoUnitario: "50.00", quantidade: 3 }],
    }));
    expect(d.classificacao).toBe("ok");
    expect(d.residuoBrutoCentavos).toBe(0);
  });

  it("acusa divergência quando um item sumiu na ingestão", () => {
    const d = decomporPedido(pedido({
      canal: "mercadolivre",
      total: "150.00",
      itens: [{ precoUnitario: "50.00", quantidade: 2 }],
    }));
    expect(d.classificacao).toBe("divergente_bruto");
    expect(d.residuoBrutoCentavos).toBe(5000);
    expect(precisaResolver(d.classificacao)).toBe(true);
  });

  it("ignora frete e desconto no total do ML (não entram em order.total_amount)", () => {
    const d = decomporPedido(pedido({
      canal: "mercadolivre",
      total: "100.00",
      frete: "20.00",
      desconto: "10.00",
      itens: [{ precoUnitario: "100.00", quantidade: 1 }],
    }));
    expect(d.classificacao).toBe("ok");
  });

  it("não confere líquido no ML — não há repasse exposto", () => {
    const d = decomporPedido(pedido({
      canal: "mercadolivre",
      total: "100.00",
      itens: [{ precoUnitario: "100.00", quantidade: 1, taxaMarketplace: "12.00" }],
    }));
    expect(d.liquidoReconstruidoCentavos).toBeNull();
    expect(d.residuoLiquidoCentavos).toBeNull();
  });

  it("tolera 2 centavos de arredondamento", () => {
    const d = decomporPedido(pedido({
      canal: "mercadolivre",
      total: "33.34",
      itens: [{ precoUnitario: "11.11", quantidade: 3 }],
    }));
    expect(d.residuoBrutoCentavos).toBe(1);
    expect(d.classificacao).toBe("ok");
  });
});

describe("decomporPedido — Shopee", () => {
  it("fecha quando itens + frete + acréscimo − desconto reconstroem o buyer_total", () => {
    const d = decomporPedido(pedido({
      canal: "shopee",
      total: "108.00",
      frete: "12.00",
      acrescimo: "1.00",
      desconto: "5.00",
      valorLiquido: "80.00",
      financeiroInformado: true,
      itens: [{ precoUnitario: "50.00", quantidade: 2, taxaMarketplace: "8.00" }],
    }));
    expect(d.classificacao).toBe("ok");
    expect(d.residuoBrutoCentavos).toBe(0);
    // líquido reconstruído = 108 − 8 (taxa) − 12 (frete) = 88; resíduo = 80 − 88 = −8
    expect(d.liquidoReconstruidoCentavos).toBe(8800);
    expect(d.residuoLiquidoCentavos).toBe(-800);
  });

  it("acusa divergência quando o comprador pagou mais que a soma dos elementos (caso +R$625)", () => {
    const d = decomporPedido(pedido({
      canal: "shopee",
      total: "725.00",
      frete: "0",
      acrescimo: "0",
      desconto: "0",
      valorLiquido: "600.00",
      financeiroInformado: true,
      itens: [{ precoUnitario: "100.00", quantidade: 1 }],
    }));
    expect(d.classificacao).toBe("divergente_bruto");
    expect(d.residuoBrutoCentavos).toBe(62500);
  });

  it("pedido recente sem repasse é aguardando_repasse, não sem_repasse", () => {
    const d = decomporPedido(pedido({
      canal: "shopee",
      total: "15.90",
      frete: "0",
      idadeDias: 5,
      financeiroInformado: false,
      itens: [{ precoUnitario: "15.90", quantidade: 1 }],
    }));
    expect(d.classificacao).toBe("aguardando_repasse");
  });

  it("pedido antigo sem repasse é sem_repasse", () => {
    const d = decomporPedido(pedido({
      canal: "shopee",
      total: "15.90",
      frete: "0",
      idadeDias: 40,
      financeiroInformado: false,
      itens: [{ precoUnitario: "15.90", quantidade: 1 }],
    }));
    expect(d.classificacao).toBe("sem_repasse");
    expect(precisaResolver(d.classificacao)).toBe(true);
  });

  it("subsídio de frete pequeno fica dentro da banda (WUWU 2608233VDDB83W: bruto 15,90 / líquido 7,91)", () => {
    const d = decomporPedido(pedido({
      canal: "shopee",
      total: "15.90",
      frete: "0.00",
      valorLiquido: "7.91",
      financeiroInformado: true,
      idadeDias: 30,
      itens: [{ precoUnitario: "15.90", quantidade: 1, taxaMarketplace: "4.00" }],
    }));
    // reconstruído = 15,90 − 4,00 − 0 = 11,90; resíduo = 7,91 − 11,90 = −3,99 (< R$20)
    expect(d.residuoLiquidoCentavos).toBe(-399);
    expect(d.classificacao).toBe("ok");
  });

  it("repasse muito abaixo da reconstrução é resíduo atípico", () => {
    const d = decomporPedido(pedido({
      canal: "shopee",
      total: "100.00",
      frete: "0",
      valorLiquido: "5.00",
      financeiroInformado: true,
      idadeDias: 30,
      itens: [{ precoUnitario: "100.00", quantidade: 1, taxaMarketplace: "10.00" }],
    }));
    // reconstruído = 100 − 10 − 0 = 90; resíduo = 5 − 90 = −85 (> banda de R$20)
    expect(d.classificacao).toBe("residuo_liquido_atipico");
  });
});

describe("decomporPedido — canais sem regra completa", () => {
  it("TikTok Shop fica não_aplicável enquanto o provider não decompõe descontos", () => {
    const d = decomporPedido(pedido({
      canal: "tiktokshop",
      total: "100.00",
      frete: "10.00",
      itens: [{ precoUnitario: "100.00", quantidade: 1 }],
    }));
    expect(d.classificacao).toBe("nao_aplicavel");
    expect(precisaResolver(d.classificacao)).toBe(false);
  });

  it("canal desconhecido não quebra — devolve não_aplicável", () => {
    const d = decomporPedido(pedido({ canal: "canal_manual", total: "10.00" }));
    expect(d.classificacao).toBe("nao_aplicavel");
    expect(d.canal).toBe("outro");
  });
});

describe("emCentavos", () => {
  it("arredonda reais para centavos inteiros e trata nulo/NaN como zero", () => {
    expect(emCentavos("15.90")).toBe(1590);
    expect(emCentavos(15.9)).toBe(1590);
    expect(emCentavos(null)).toBe(0);
    expect(emCentavos("abc")).toBe(0);
  });
});
