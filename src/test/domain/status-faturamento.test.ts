import { describe, expect, it } from "vitest";
import {
  marcarEvidenciaPagamento,
  possuiEvidenciaPagamentoAprovado,
  STATUS_PEDIDO_FATURAVEL,
  statusPedidoFaturavel,
} from "@/modules/vendas/domain/status-faturamento";

describe("status que compõe faturamento", () => {
  it("aceita somente estados com pagamento confirmado", () => {
    expect(STATUS_PEDIDO_FATURAVEL).toEqual([
      "pago",
      "separado",
      "enviado",
      "entregue",
      "avaliacao_solicitada",
      "concluido",
    ]);
    expect(STATUS_PEDIDO_FATURAVEL.every(statusPedidoFaturavel)).toBe(true);
  });

  it.each(["criado", "cancelado", "devolvido", "", "desconhecido"])(
    "não assume %s como receita",
    (status) => expect(statusPedidoFaturavel(status)).toBe(false),
  );

  it("distingue cancelamento sem pagamento de ajuste depois do pagamento", () => {
    expect(possuiEvidenciaPagamentoAprovado({ valorPago: 0, pagamentos: [] })).toBe(false);
    expect(possuiEvidenciaPagamentoAprovado({ valorPago: 19.9, pagamentos: [] })).toBe(true);
    expect(possuiEvidenciaPagamentoAprovado({ pagamentos: [{ status: "approved" }] })).toBe(true);
    expect(possuiEvidenciaPagamentoAprovado({ pagamentos: [{ status: "cancelled", total: 0 }] })).toBe(false);
    expect(possuiEvidenciaPagamentoAprovado({ pagamentos: [{ reembolsado: 10 }] })).toBe(true);
  });

  it("preserva a aprovação quando o pedido muda de pago para cancelado", () => {
    const pago = marcarEvidenciaPagamento({}, "pago");
    expect(pago.pagamentoAprovado).toBe(true);
    expect(marcarEvidenciaPagamento(pago, "cancelado").pagamentoAprovado).toBe(true);
    // Cancelado sem nenhuma evidência fica desconhecido, não "não pago": a
    // ausência de dado não pode virar prova contra o pedido antes de uma
    // reconciliação trazer o financeiro do canal.
    expect(marcarEvidenciaPagamento({}, "cancelado")).not.toHaveProperty("pagamentoAprovado");
  });
});
