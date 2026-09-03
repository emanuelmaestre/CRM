import { describe, expect, it } from "vitest";
import { agruparRepasses, type TikTokTransacaoExtrato } from "@/modules/canais/infrastructure/tiktokshop.provider";
import { ratearComissao } from "@/modules/canais/application/repasse-tiktok.service";

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

/* A comissão da tela do pedido ("Taxa do canal de venda") sai só das linhas de
   comissão do extrato — nunca de `fee_amount`, que soma comissão e frete real
   e diria que o canal cobrou o frete pago à transportadora. */
describe("comissão do TikTok na linha de taxa", () => {
  it("soma comissão, referral e taxa de transação, com sinal invertido", () => {
    const [repasse] = agruparRepasses([transacao({
      order_id: "10",
      revenue_amount: "26.90",
      settlement_amount: "15.37",
      fee_amount: "-11.53",
      platform_commission_amount: "-2.69",
      referral_fee_amount: "-0.30",
      transaction_fee_amount: "-0.11",
    })]);
    expect(repasse.comissao).toBe(3.1);
    // `taxas` continua sendo o pacote inteiro do extrato, frete incluído.
    expect(repasse.taxas).toBe(-11.53);
  });

  it("frete do extrato não entra na comissão", () => {
    const [repasse] = agruparRepasses([transacao({
      order_id: "11",
      revenue_amount: "28.40",
      settlement_amount: "16.30",
      fee_amount: "-12.10",
      platform_commission_amount: "-2.84",
      actual_shipping_fee_amount: "-15.20",
      fbm_shipping_cost_amount: "-7.60",
    })]);
    expect(repasse.comissao).toBe(2.84);
  });

  it("estorno maior que a cobrança não vira comissão negativa", () => {
    const [repasse] = agruparRepasses([
      transacao({ order_id: "12", revenue_amount: "10.00", settlement_amount: "9.00", platform_commission_amount: "-1.00" }),
      transacao({ order_id: "12", revenue_amount: "-10.00", settlement_amount: "-8.00", platform_commission_amount: "1.50" }),
    ]);
    expect(repasse.comissao).toBe(0);
  });
});

describe("rateio da comissão entre os itens", () => {
  const item = (id: string, precoUnitario: number, quantidade = 1) => ({ id, precoUnitario, quantidade });

  it("divide proporcional ao valor de cada linha", () => {
    const rateio = ratearComissao(1000, [item("a", 30), item("b", 70)]);
    expect(rateio.get("a")).toBe(300);
    expect(rateio.get("b")).toBe(700);
  });

  it("o centavo que sobra vai para a última linha, sem evaporar", () => {
    const rateio = ratearComissao(1000, [item("a", 10), item("b", 10), item("c", 10)]);
    expect([...rateio.values()].reduce((t, v) => t + v, 0)).toBe(1000);
    expect(rateio.get("c")).toBe(334);
  });

  it("leva a quantidade em conta, não só o preço", () => {
    const rateio = ratearComissao(900, [item("a", 10, 2), item("b", 10, 1)]);
    expect(rateio.get("a")).toBe(600);
    expect(rateio.get("b")).toBe(300);
  });

  it("pedido com tudo zerado divide em partes iguais em vez de dividir por zero", () => {
    const rateio = ratearComissao(100, [item("a", 0), item("b", 0)]);
    expect([...rateio.values()].reduce((t, v) => t + v, 0)).toBe(100);
  });

  it("pedido sem item não gera escrita", () => {
    expect(ratearComissao(500, []).size).toBe(0);
  });
});
