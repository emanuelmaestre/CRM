import { describe, expect, it } from "vitest";
import {
  calcularProgressoExecucao,
  progressoDoModulo,
} from "@/modules/canais/domain/sincronizacao-progresso";

describe("progresso da sincronização", () => {
  it("usa a porcentagem real persistida pelo job", () => {
    expect(progressoDoModulo("em_andamento", { progresso: 37 })).toBe(37);
  });

  it("nunca anuncia 100% antes de o módulo concluir", () => {
    expect(progressoDoModulo("em_andamento", { progresso: 100 })).toBe(99);
    expect(progressoDoModulo("concluido", { progresso: 61 })).toBe(100);
  });

  it("ignora módulos fora de uma atualização pontual", () => {
    const execucao = {
      catalogoStatus: "concluido",
      catalogoResultado: { omitido: true, progresso: 100 },
      pedidosStatus: "em_andamento",
      pedidosResultado: { progresso: 42 },
      anunciosStatus: "concluido",
      anunciosResultado: { omitido: true, progresso: 100 },
      avaliacoesStatus: "concluido",
      avaliacoesResultado: { omitido: true, progresso: 100 },
      reputacaoStatus: "concluido",
      reputacaoResultado: { omitido: true, progresso: 100 },
    };
    expect(calcularProgressoExecucao(execucao)).toBe(42);
  });

  it("calcula a média dos módulos pedidos na sincronização completa", () => {
    expect(calcularProgressoExecucao({
      catalogoStatus: "concluido",
      catalogoResultado: { progresso: 100 },
      pedidosStatus: "em_andamento",
      pedidosResultado: { progresso: 50 },
      anunciosStatus: "pendente",
      avaliacoesStatus: "pendente",
      reputacaoStatus: "pendente",
    })).toBe(30);
  });

  it("limita valores inválidos ao intervalo de zero a cem", () => {
    expect(progressoDoModulo("em_andamento", { progresso: -10 })).toBe(1);
    expect(progressoDoModulo("em_andamento", { progresso: 150 })).toBe(99);
  });
});
