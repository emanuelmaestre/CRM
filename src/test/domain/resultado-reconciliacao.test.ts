import { describe, expect, it } from "vitest";
import {
  reconciliacaoFalhouPorCompleto,
  resumirResultadosReconciliacao,
  type ResultadoReconciliacaoConta,
} from "@/modules/canais/domain/resultado-reconciliacao";

const base = { tipo: "mercadolivre", marca: "karzi" };
const resultado = (parcial: Partial<ResultadoReconciliacaoConta>): ResultadoReconciliacaoConta => ({
  contaId: parcial.contaId ?? crypto.randomUUID(),
  ...base,
  ...parcial,
});

describe("resultado da reconciliação A34", () => {
  it("não transforma concorrência saudável em falha", () => {
    const itens = [resultado({ adiada: "outra sincronização ativa" })];
    expect(reconciliacaoFalhouPorCompleto(itens)).toBe(false);
    expect(resumirResultadosReconciliacao(itens)).toMatchObject({ adiadas: 1, falhas: 0 });
  });

  it("preserva sucesso parcial quando outra conta falha", () => {
    const itens = [resultado({ execucaoId: "exec-1" }), resultado({ erro: "token inválido" })];
    expect(reconciliacaoFalhouPorCompleto(itens)).toBe(false);
    expect(resumirResultadosReconciliacao(itens)).toEqual({ contas: 2, despachadas: 1, adiadas: 0, falhas: 1 });
  });

  it("falha quando nenhuma conta conseguiu nem pôde adiar", () => {
    expect(reconciliacaoFalhouPorCompleto([
      resultado({ erro: "token inválido" }),
      resultado({ erro: "canal indisponível" }),
    ])).toBe(true);
  });
});
