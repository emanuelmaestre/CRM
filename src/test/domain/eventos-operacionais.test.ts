import { describe, expect, it } from "vitest";
import {
  EVENTO_AUDITAR_FINANCEIRO,
  EVENTO_RECONCILIAR_PEDIDOS,
} from "@/modules/jobs/eventos-operacionais";

describe("gatilhos operacionais dos jobs de conciliação", () => {
  it("usa nomes distintos e estáveis para A34 e A35", () => {
    expect(EVENTO_RECONCILIAR_PEDIDOS).toBe("operacao/reconciliacao-pedidos.solicitada");
    expect(EVENTO_AUDITAR_FINANCEIRO).toBe("operacao/auditoria-financeira.solicitada");
    expect(EVENTO_RECONCILIAR_PEDIDOS).not.toBe(EVENTO_AUDITAR_FINANCEIRO);
  });
});
