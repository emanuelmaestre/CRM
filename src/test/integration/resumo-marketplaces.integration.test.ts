import { afterAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import { composicaoResumoPedidosSql } from "@/modules/vendas/infrastructure/composicao-resumo.sql";
import { dataVendaPedidoSql, pedidoComercialSql, reembolsoParcialPedidoSql } from "@/modules/vendas/infrastructure/valor-faturamento.sql";

// CTEs de valores sintéticos: executa o SQL real sem inserir/alterar tabelas.
const client = postgres(process.env.DATABASE_URL!, { max: 1, prepare: false });
const db = drizzle(client);
afterAll(() => client.end());
type Linha = { canal: string; status: string; total: number; acrescimo?: number; dados_origem?: object; criado_em?: string };
async function resumir(linhas: Linha[], inicio = "2026-09-05T00:00:00-03:00", fim = "2026-09-05T23:59:59.999-03:00") {
  const c = composicaoResumoPedidosSql();
  const dados = linhas.map((p) => ({ criado_em: "2026-09-05T12:00:00-03:00", dados_origem: {}, ...p }));
  const [r] = await db.execute(sql`with pedido as (
    select * from jsonb_to_recordset(${JSON.stringify(dados)}::jsonb)
      as x(canal text, status text, total numeric, acrescimo numeric, dados_origem jsonb, criado_em timestamptz)
  ) select count(*) filter (where ${c.bruto})::int bruto_qtd,
    coalesce(sum(${c.valorBruto}) filter (where ${c.bruto}),0)::float8 bruto,
    count(*) filter (where ${c.faturavel})::int confirmado_qtd,
    coalesce(sum(${c.valorConfirmado}) filter (where ${c.faturavel}),0)::float8 confirmado,
    count(*) filter (where ${c.cancelado} or ${c.devolvido})::int cancelado_qtd,
    coalesce(sum(${c.valorOriginal}) filter (where ${c.cancelado} or ${c.devolvido}),0)::float8 cancelado,
    count(*) filter (where ${c.pendente})::int pendente_qtd,
    coalesce(sum(${c.valorOriginal}) filter (where ${c.pendente}),0)::float8 pendente,
    coalesce(sum(${reembolsoParcialPedidoSql()}) filter (where ${c.faturavel}),0)::float8 reembolso
    from pedido where ${pedidoComercialSql()} and ${dataVendaPedidoSql()} >= ${inicio}::timestamptz
      and ${dataVendaPedidoSql()} <= ${fim}::timestamptz`);
  return r;
}

describe("composição dos cards por marketplace", () => {
  it("TikTok reconhece reembolso rápido completo e parcial sem antecipar devolução pendente", async () => {
    const caso = { status: "BUYER_SHIPPED_ITEM", reembolsadoEmMs: 1788200842000 };
    const r = await resumir([
      { canal: "tiktokshop", status: "entregue", total: 126.25, dados_origem: { status: "COMPLETED", reembolsosTikTok: [{ ...caso, valor: 126.25 }] } },
      { canal: "tiktokshop", status: "entregue", total: 30, dados_origem: { status: "COMPLETED", reembolsosTikTok: [{ ...caso, valor: 10 }] } },
      { canal: "tiktokshop", status: "entregue", total: 50, dados_origem: { status: "COMPLETED", reembolsosTikTok: [{ status: "BUYER_SHIPPED_ITEM", valor: 50, reembolsadoEmMs: "inválido" }] } },
    ]);
    expect(r).toMatchObject({ bruto: 206.25, confirmado: 70, confirmado_qtd: 2, cancelado: 126.25, cancelado_qtd: 1, reembolso: 10 });
  });
  it("TikTok: distingue reembolso integral do parcial, ignora solicitação cancelada e mantém o bruto", async () => {
    const refund = (valor: number, status = "RETURN_OR_REFUND_REQUEST_COMPLETE") => ({ valor, status });
    const r = await resumir([
      { canal: "tiktokshop", status: "entregue", total: 111.1, dados_origem: { status: "COMPLETED", reembolsosTikTok: [refund(111.1), refund(111.1, "RETURN_OR_REFUND_REQUEST_CANCEL")] } },
      { canal: "tiktokshop", status: "entregue", total: 31.66, dados_origem: { status: "DELIVERED", reembolsosTikTok: [refund(11.46)] } },
      { canal: "tiktokshop", status: "cancelado", total: 20, dados_origem: { status: "CANCELLED", reembolsosTikTok: [refund(20)] } },
      { canal: "mercadolivre", status: "pago", total: 40, dados_origem: { pagamentos: [{ reembolsado: 10 }] } },
    ]);
    expect(r).toMatchObject({ bruto_qtd: 4, bruto: 202.76, confirmado_qtd: 2, confirmado: 50.2, cancelado_qtd: 2, cancelado: 131.1, reembolso: 21.46 });
  });
  it("prioriza o estado informado por Shopee/TikTok sobre a etapa operacional, preservando ML e legados", async () => {
    const r = await resumir([
      { canal: "shopee", status: "entregue", total: 69.9, dados_origem: { status: "TO_RETURN" } },
      { canal: "tiktokshop", status: "criado", total: 20, dados_origem: { status: "ON_HOLD" } },
      { canal: "tiktokshop", status: "pago", total: 30, dados_origem: { status: "NOVO_STATUS" } },
      { canal: "mercadolivre", status: "pago", total: 40, dados_origem: { status: "TO_RETURN" } },
      { canal: "shopee", status: "pago", total: 50 },
    ]);
    expect(r).toMatchObject({ bruto_qtd: 5, bruto: 209.9, confirmado_qtd: 3, confirmado: 110, cancelado_qtd: 1, cancelado: 69.9, pendente_qtd: 1, pendente: 30 });
  });
  it("TikTok: inclui oito cancelados e preserva o Order Amount oficial, sem forçar o valor da Olist", async () => {
    // Oito totais efetivamente encontrados na auditoria de 05/09; os 67
    // confirmados e quatro cancelados pagos abaixo são fixtures sintéticas.
    const semPagamento = [22.47, 21.47, 43.67, 21.47, 21.36, 22.07, 21.47, 21.47];
    const linhas: Linha[] = [
      ...Array.from({ length: 66 }, () => ({ canal: "tiktokshop", status: "pago", total: 20 })),
      { canal: "tiktokshop", status: "pago", total: 541.53, acrescimo: 2.08 },
      ...[50, 50, 50, 93.74].map((total) => ({ canal: "tiktokshop", status: "cancelado", total, dados_origem: { pagamentoAprovado: true } })),
      ...semPagamento.map((total) => ({ canal: "tiktokshop", status: "cancelado", total, dados_origem: { pagamentoAprovado: false } })),
    ];
    expect(await resumir(linhas)).toMatchObject({ bruto_qtd: 79, bruto: 2300.72, confirmado_qtd: 67, confirmado: 1861.53, cancelado_qtd: 12, cancelado: 439.19 });
  });

  it("Shopee: os vinte pedidos incluem o checkout ainda não pago, sem mascarar os R$ 0,14 ainda não conciliados", async () => {
    const linhas: Linha[] = [
      ...Array.from({ length: 17 }, () => ({ canal: "shopee", status: "pago", total: 40 })),
      { canal: "shopee", status: "pago", total: 90.15 },
      { canal: "shopee", status: "cancelado", total: 69.89, dados_origem: { pagamentoAprovado: true } },
      { canal: "shopee", status: "criado", total: 78.28 },
    ];
    expect(await resumir(linhas)).toMatchObject({ bruto_qtd: 20, bruto: 918.32, confirmado_qtd: 18, confirmado: 770.15, cancelado_qtd: 1, cancelado: 69.89, pendente_qtd: 1, pendente: 78.28 });
  });
  it("preserva handling_fee no Order Amount oficial do TikTok e não altera os outros canais", async () => {
    const r = await resumir([
      { canal: "tiktokshop", status: "pago", total: 23.55, acrescimo: 2.08 },
      { canal: "tiktokshop", status: "cancelado", total: 52, acrescimo: 2 },
      { canal: "tiktokshop", status: "criado", total: 35, acrescimo: 3 },
      { canal: "shopee", status: "pago", total: 23.55, acrescimo: 2.08 },
      { canal: "mercadolivre", status: "pago", total: 23.55, acrescimo: 2.08 },
    ]);
    expect(r).toMatchObject({ bruto_qtd: 5, bruto: 157.65, confirmado: 70.65, cancelado: 52, pendente: 35 });
  });
  it.each(["shopee", "tiktokshop"])("%s inclui pendentes e cancelados sem transformar checkouts em receita", async (canal) => {
    const r = await resumir([
      { canal, status: "pago", total: 100, dados_origem: { pagamentos: [{ reembolsado: 12.5 }] } },
      { canal, status: "criado", total: 78.28 },
      { canal, status: "cancelado", total: 21.47, dados_origem: { pagamentoAprovado: false } },
      { canal, status: "devolvido", total: 35, dados_origem: { pagamentoAprovado: true } },
    ]);
    expect(r).toEqual({ bruto_qtd: 4, bruto: 234.75, confirmado_qtd: 1, confirmado: 87.5,
      cancelado_qtd: 2, cancelado: 56.47, pendente_qtd: 1, pendente: 78.28, reembolso: 12.5 });
    expect(Number(r.bruto)).toBeCloseTo(Number(r.confirmado) + Number(r.cancelado) + Number(r.pendente) + Number(r.reembolso), 2);
  });

  it("preserva Mercado Livre num resumo misto, inclusive aprovação, pagamento e divisão de pacote", async () => {
    const aprovadoEmMs = Date.parse("2026-09-05T13:00:00-03:00");
    const r = await resumir([
      { canal: "mercadolivre", status: "criado", total: 80 },
      { canal: "mercadolivre", status: "cancelado", total: 90, dados_origem: { pagamentoAprovado: false } },
      { canal: "mercadolivre", status: "cancelado", total: 30, dados_origem: { pagamentoAprovado: true } },
      { canal: "mercadolivre", status: "cancelado", total: 900, dados_origem: { pagamentoAprovado: true, cancelamento: { code: "pack_splitted" } } },
      { canal: "mercadolivre", status: "pago", total: 100, criado_em: "2026-09-04T12:00:00-03:00", dados_origem: { aprovadoEmMs, pagamentos: [{ reembolsado: 10 }] } },
      { canal: "shopee", status: "criado", total: 20, dados_origem: { aprovadoEmMs: Date.parse("2026-09-04T12:00:00-03:00") } },
      { canal: "tiktokshop", status: "cancelado", total: 40, dados_origem: { pagamentoAprovado: false } },
    ]);
    expect(r).toEqual({ bruto_qtd: 4, bruto: 190, confirmado_qtd: 1, confirmado: 90,
      cancelado_qtd: 2, cancelado: 70, pendente_qtd: 1, pendente: 20, reembolso: 10 });
  });

  it.each(["shopee", "tiktokshop"])("%s usa criação e limites inclusivos do dia em Brasília", async (canal) => {
    const r = await resumir([
      { canal, status: "criado", total: 10, criado_em: "2026-09-05T02:59:59.999Z" },
      { canal, status: "criado", total: 20, criado_em: "2026-09-05T03:00:00.000Z" },
      { canal, status: "criado", total: 30, criado_em: "2026-09-06T02:59:59.999Z" },
      { canal, status: "criado", total: 40, criado_em: "2026-09-06T03:00:00.000Z" },
    ]);
    expect(r).toMatchObject({ bruto_qtd: 2, bruto: 50, pendente_qtd: 2, confirmado_qtd: 0 });
  });
});
