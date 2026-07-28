import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;

const { dbMock, emitirEventoMock } = vi.hoisted(() => {
  function makeDbMock() {
    const selectQueue: Row[][] = [];
    const insertQueue: (Row[] | undefined)[] = [];
    const updateQueue: Row[][] = [];

    function makeChain(result: unknown) {
      const chain: Record<string, unknown> = {};
      chain.from = vi.fn(() => chain);
      chain.where = vi.fn(() => chain);
      chain.orderBy = vi.fn(() => chain);
      chain.groupBy = vi.fn(() => chain);
      chain.values = vi.fn(() => chain);
      chain.set = vi.fn(() => chain);
      chain.limit = vi.fn(() => Promise.resolve(result));
      chain.returning = vi.fn(() => Promise.resolve(result));
      chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(result).then(resolve, reject);
      return chain;
    }

    const select = vi.fn(() => makeChain(selectQueue.shift() ?? []));
    const insert = vi.fn(() => makeChain(insertQueue.shift() ?? []));
    const update = vi.fn(() => makeChain(updateQueue.shift() ?? []));

    return { select, insert, update, selectQueue, insertQueue, updateQueue };
  }

  return { dbMock: makeDbMock(), emitirEventoMock: vi.fn().mockResolvedValue(undefined) };
});

vi.mock("@/shared/lib/db", () => ({ db: dbMock }));
vi.mock("@/shared/events", () => ({ emitirEvento: emitirEventoMock }));

const { gerarInsightFunil, aprovarSugestao, rejeitarSugestao, consultarConsumoIA, obterConsumoDetalhado } =
  await import("@/modules/ai/application/ai.service");

const ORG_ID = "11111111-1111-4111-8111-111111111111";

function mockFetchOnce(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) };
}

describe("ai.service — consumo e corte suave de orçamento", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.selectQueue.length = 0;
    dbMock.insertQueue.length = 0;
    dbMock.updateQueue.length = 0;
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.AI_MONTHLY_BUDGET_USD = "10";
  });

  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.AI_MONTHLY_BUDGET_USD;
    vi.unstubAllGlobals();
  });

  it("bloqueia nova geração quando o consumo do mês já atingiu o orçamento (corte suave)", async () => {
    dbMock.selectQueue.push([{ total: "10.50" }]); // consumoMesAtual > orçamento de 10

    await expect(gerarInsightFunil(ORG_ID, { pedidos: 10 }))
      .rejects.toThrow(/Orçamento de IA atingido/);

    expect(emitirEventoMock).toHaveBeenCalledWith(expect.objectContaining({
      tipo: "ia.limite_consumo_atingido",
      payload: expect.objectContaining({ consumoAtual: 10.5, limite: 10 }),
    }));
  });

  it("lança erro claro quando OPENAI_API_KEY não está configurada, sem chamar fetch", async () => {
    delete process.env.OPENAI_API_KEY;
    dbMock.selectQueue.push([{ total: "0" }]);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await expect(gerarInsightFunil(ORG_ID, { pedidos: 10 }))
      .rejects.toThrow(/OPENAI_API_KEY não configurada/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("repara automaticamente quando a primeira resposta falha na validação do schema", async () => {
    dbMock.selectQueue.push([{ total: "0" }]); // consumoMesAtual

    const insightValido = {
      titulo: "Funil aquecido no último mês",
      conteudo: "A conversão subiu 12% no período, puxada pelo canal WhatsApp.",
      numerosFonte: [{ nome: "conversao", valor: 0.12 }],
      confianca: 0.8,
    };

    const fetchSpy = vi.fn()
      .mockResolvedValueOnce(mockFetchOnce(200, {
        choices: [{ message: { content: JSON.stringify({ titulo: "curto" }) } }], // falha: schema exige mínimos
        usage: { prompt_tokens: 100, completion_tokens: 20 },
      }))
      .mockResolvedValueOnce(mockFetchOnce(200, {
        choices: [{ message: { content: JSON.stringify(insightValido) } }],
        usage: { prompt_tokens: 120, completion_tokens: 60 },
      }));
    vi.stubGlobal("fetch", fetchSpy);

    dbMock.insertQueue.push(undefined); // registrarLlmRun (tentativa 1, falha)
    dbMock.insertQueue.push(undefined); // registrarLlmRun (tentativa 2, sucesso)
    dbMock.insertQueue.push([{ id: "insight-1" }]); // insert do insight final

    const resultado = await gerarInsightFunil(ORG_ID, { pedidos: 10 });

    expect(resultado).toEqual({ gerado: true, id: "insight-1" });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(emitirEventoMock).toHaveBeenCalledWith(expect.objectContaining({ tipo: "ia.insight_gerado" }));
  });

  it("desiste após a tentativa de reparo e propaga erro claro", async () => {
    dbMock.selectQueue.push([{ total: "0" }]);

    const fetchSpy = vi.fn().mockResolvedValue(mockFetchOnce(200, {
      choices: [{ message: { content: JSON.stringify({ titulo: "curto" }) } }],
      usage: { prompt_tokens: 50, completion_tokens: 10 },
    }));
    vi.stubGlobal("fetch", fetchSpy);

    dbMock.insertQueue.push(undefined, undefined); // 2 tentativas de log, ambas falhas

    await expect(gerarInsightFunil(ORG_ID, { pedidos: 10 }))
      .rejects.toThrow(/Saída da IA inválida após uma tentativa de reparo/);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});

describe("ai.service — aprovação humana obrigatória (Invariante nº4)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.selectQueue.length = 0;
    dbMock.insertQueue.length = 0;
    dbMock.updateQueue.length = 0;
  });

  it("aprova apenas sugestão pendente e não expirada, emitindo evento", async () => {
    dbMock.updateQueue.push([{ id: "sug-1" }]);

    await aprovarSugestao(ORG_ID, "sug-1", "user-1");

    expect(emitirEventoMock).toHaveBeenCalledWith(expect.objectContaining({
      tipo: "ia.sugestao_aprovada",
      entidadeId: "sug-1",
    }));
  });

  it("rejeita aprovar sugestão já decidida/expirada (update não afeta linhas)", async () => {
    dbMock.updateQueue.push([]); // WHERE não bateu — já decidida, expirada ou inexistente

    await expect(aprovarSugestao(ORG_ID, "sug-2", "user-1"))
      .rejects.toThrow(/inexistente, expirada ou já decidida/);
    expect(emitirEventoMock).not.toHaveBeenCalledWith(expect.objectContaining({ tipo: "ia.sugestao_aprovada" }));
  });

  it("rejeitarSugestao segue a mesma trava atômica", async () => {
    dbMock.updateQueue.push([]);

    await expect(rejeitarSugestao(ORG_ID, "sug-3", "sem orçamento"))
      .rejects.toThrow(/inexistente, expirada ou já decidida/);
  });
});

describe("ai.service — agregação de consumo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.selectQueue.length = 0;
    process.env.AI_MONTHLY_BUDGET_USD = "20";
  });

  afterEach(() => {
    delete process.env.AI_MONTHLY_BUDGET_USD;
  });

  it("calcula percentual e alerta de 70%/90% corretamente", async () => {
    dbMock.selectQueue.push([{ total: "15.00" }]); // 75% de 20 → alerta 70%
    const resumo = await consultarConsumoIA(ORG_ID);
    expect(resumo.percentual).toBe(75);
    expect(resumo.alerta).toBe("70%");
  });

  it("sem consumo no mês retorna 0% e nenhum alerta", async () => {
    dbMock.selectQueue.push([{ total: "0" }]);
    const resumo = await consultarConsumoIA(ORG_ID);
    expect(resumo.percentual).toBe(0);
    expect(resumo.alerta).toBeNull();
  });

  it("obterConsumoDetalhado agrega custo por finalidade e taxa de sucesso", async () => {
    dbMock.selectQueue.push([{ total: "5.00" }]); // consultarConsumoIA
    dbMock.selectQueue.push([
      { finalidade: "insight_funil", custo: "3.00", runs: 2 },
      { finalidade: "sugestao_campanha", custo: "2.00", runs: 1 },
    ]); // porFinalidade
    dbMock.selectQueue.push([{ total: 3, sucesso: 2 }]); // totalRuns
    dbMock.selectQueue.push([{ id: "run-1" }]); // recentes

    const detalhado = await obterConsumoDetalhado(ORG_ID);

    expect(detalhado.totalRuns).toBe(3);
    expect(detalhado.taxaSucesso).toBe(67);
    expect(detalhado.porFinalidade).toEqual([
      { finalidade: "insight_funil", custoUsd: 3, runs: 2 },
      { finalidade: "sugestao_campanha", custoUsd: 2, runs: 1 },
    ]);
    expect(detalhado.recentes).toEqual([{ id: "run-1" }]);
  });
});
