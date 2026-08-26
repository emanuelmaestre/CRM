import { describe, expect, it } from "vitest";
import {
  calcularProgressoExecucao,
  progressoDoModulo,
  progressoDoResultado,
  resultadoOmitido,
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

  /* O painel não lê mais o JSONB inteiro do resultado: o banco devolve um
     resumo com as três chaves usadas, e chave ausente vira `null` em vez de
     sumir do objeto. Sem a guarda, Number(null) === 0 faria "sem progresso
     registrado" virar "progresso zero" — e o módulo pareceria travado no
     início em vez de simplesmente não ter informado nada. */
  it("trata progresso nulo como ausente, não como zero", () => {
    expect(progressoDoResultado({ progresso: null })).toBeNull();
    expect(progressoDoResultado({ progresso: null, omitido: null })).toBeNull();
    // Continua caindo no padrão de "em andamento sem número informado".
    expect(progressoDoModulo("em_andamento", { progresso: null })).toBe(5);
    expect(progressoDoModulo("pendente", { progresso: null })).toBe(0);
  });

  it("ainda distingue progresso zero declarado de progresso ausente", () => {
    expect(progressoDoResultado({ progresso: 0 })).toBe(0);
    expect(progressoDoResultado({})).toBeNull();
    expect(progressoDoResultado(null)).toBeNull();
  });

  it("reconhece módulo omitido no resumo vindo do banco", () => {
    // O resumo traz as três chaves sempre; omitido continua valendo.
    expect(resultadoOmitido({ progresso: 100, omitido: true, desativado: null })).toBe(true);
    expect(resultadoOmitido({ progresso: 42, omitido: null, desativado: null })).toBe(false);
  });
});
