import { describe, expect, it } from "vitest";
import { agruparRepasses, type TikTokTransacaoExtrato } from "@/modules/canais/infrastructure/tiktokshop.provider";

const transacao = (parcial: Partial<TikTokTransacaoExtrato>): TikTokTransacaoExtrato => ({
  currency: "BRL",
  type: "ORDER",
  ...parcial,
});

/* Os números vêm de extratos reais da WUWU lidos em 03/09/2026: o pedido
   584708858748240935 fechou com receita 34,90, taxa −8,18 e repasse 26,72. */
describe("repasse do TikTok Shop", () => {
  it("converte a linha do extrato em repasse do pedido", () => {
    const [repasse] = agruparRepasses([transacao({
      order_id: "584708858748240935",
      revenue_amount: "34.9",
      fee_amount: "-8.18",
      settlement_amount: "26.72",
      shipping_cost_amount: "0",
    })]);
    expect(repasse).toMatchObject({
      orderId: "584708858748240935",
      receita: 34.9,
      taxas: -8.18,
      liquido: 26.72,
      transacoes: 1,
    });
  });

  it("soma as transações do mesmo pedido em vez de ficar com a última", () => {
    // Venda num extrato e devolução parcial em outro: o líquido do pedido é a
    // soma das duas. Ficar com a última gravaria um valor negativo.
    const [repasse] = agruparRepasses([
      transacao({ order_id: "1", revenue_amount: "100.00", fee_amount: "-25.00", settlement_amount: "75.00" }),
      transacao({ order_id: "1", revenue_amount: "-30.00", fee_amount: "7.50", settlement_amount: "-22.50" }),
    ]);
    expect(repasse.liquido).toBe(52.5);
    expect(repasse.receita).toBe(70);
    expect(repasse.transacoes).toBe(2);
  });

  it("descarta pedido ainda sem extrato em vez de gravar zero", () => {
    // Pedido pago hoje responde 200 com tudo zerado. Gravar isso diria que o
    // vendedor não recebeu nada — pior que não ter o dado.
    expect(agruparRepasses([transacao({
      order_id: "2",
      revenue_amount: "0",
      fee_amount: "0",
      settlement_amount: "0",
    })])).toEqual([]);
  });

  it("soma em centavos para não arrastar erro de ponto flutuante", () => {
    const [repasse] = agruparRepasses([
      transacao({ order_id: "3", revenue_amount: "0.1", settlement_amount: "0.1" }),
      transacao({ order_id: "3", revenue_amount: "0.2", settlement_amount: "0.2" }),
    ]);
    expect(repasse.liquido).toBe(0.3);
  });

  it("linha sem pedido não vira repasse", () => {
    expect(agruparRepasses([transacao({ settlement_amount: "10.00", type: "ADJUSTMENT" })])).toEqual([]);
  });

  it("valor que não é número derruba a leitura em vez de virar zero", () => {
    expect(() => agruparRepasses([transacao({ order_id: "4", settlement_amount: "R$ 10,00" })]))
      .toThrow(/valor financeiro inválido/);
  });
});
