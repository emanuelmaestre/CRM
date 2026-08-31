import { describe, expect, it } from "vitest";
import { preservarFinanceiroConfirmado } from "@/modules/canais/domain/financeiro-confirmado";
import type { PedidoNormalizado } from "@/modules/canais/domain/ports";

const recebido: PedidoNormalizado = {
  providerOrderId: "P1", canal: "shopee", clienteExternalId: "C1", clienteNome: "Comprador",
  status: "completed", total: "100", criadoEm: new Date("2026-08-01T03:00:00Z"),
  dadosOrigem: { financeiroInformado: false }, itens: [],
};

describe("financeiro confirmado não regride para fallback", () => {
  it("preserva o total confirmado quando o endpoint de repasse falha", () => {
    expect(preservarFinanceiroConfirmado({ canal: "shopee", valorLiquido: "75.00", dadosOrigem: { financeiroInformado: true } }, recebido)).toBe(true);
  });
  it("reconhece o repasse de pedidos antigos sem metadados", () => {
    expect(preservarFinanceiroConfirmado({ canal: "shopee", valorLiquido: "75.00", dadosOrigem: null }, recebido)).toBe(true);
  });
  it("repasse zero também é uma informação confirmada", () => {
    expect(preservarFinanceiroConfirmado({ canal: "shopee", valorLiquido: "0.00", dadosOrigem: null }, recebido)).toBe(true);
  });
  it("aceita a primeira leitura quando ainda não há financeiro", () => {
    expect(preservarFinanceiroConfirmado({ canal: "shopee", valorLiquido: null, dadosOrigem: null }, recebido)).toBe(false);
  });
  it("aceita correções oficiais posteriores, inclusive valor zero", () => {
    for (const valorLiquido of ["0.00", "70.00"]) {
      expect(preservarFinanceiroConfirmado({ canal: "shopee", valorLiquido: "75.00", dadosOrigem: null }, {
        ...recebido, total: "90.00", valorLiquido, dadosOrigem: { financeiroInformado: true },
      })).toBe(false);
    }
  });
  it("não muda a regra do Mercado Livre", () => {
    expect(preservarFinanceiroConfirmado({ canal: "mercadolivre", valorLiquido: null, dadosOrigem: null }, { ...recebido, canal: "mercadolivre" })).toBe(false);
  });
});
