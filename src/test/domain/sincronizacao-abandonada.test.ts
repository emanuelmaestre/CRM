import { describe, expect, it, vi, afterEach } from "vitest";

/* Execução de sincronização que morre sem gravar o desfecho (função morta pelo
   limite de tempo, deploy no meio, Inngest desistindo) deixava a linha em
   "em andamento" para sempre e a tela girando sem fim — aconteceu em
   25/08/2026, com uma execução parada por 45+ minutos. */

const selectMock = vi.fn();
vi.mock("@/shared/lib/db", () => ({ db: {} }));
vi.mock("@/shared/lib/inngest/client", () => ({ inngest: { send: vi.fn() } }));
vi.mock("@/shared/lib/crud-factory", () => ({
  assertPerfil: vi.fn(),
}));

const { obterUltimaSincronizacaoConta } = await import("@/modules/canais/application/sincronizacao.service");

type Execucao = Record<string, unknown>;

function contextoCom(execucao: Execucao | null) {
  selectMock.mockReturnValue({
    from: () => ({
      where: () => ({
        orderBy: () => ({
          limit: () => Promise.resolve(execucao ? [execucao] : []),
        }),
      }),
    }),
  });
  return { db: { select: selectMock }, orgId: "org-1", perfil: "admin" } as never;
}

function execucaoBase(overrides: Execucao = {}): Execucao {
  return {
    id: "exec-1",
    iniciadoEm: new Date(),
    finalizadoEm: null,
    catalogoStatus: "concluido",
    catalogoErro: null,
    pedidosStatus: "em_andamento",
    pedidosErro: null,
    anunciosStatus: "pendente",
    anunciosErro: null,
    avaliacoesStatus: "pendente",
    avaliacoesErro: null,
    reputacaoStatus: "pendente",
    reputacaoErro: null,
    reclamacoesStatus: "pendente",
    reclamacoesErro: null,
    mensagensStatus: "pendente",
    mensagensErro: null,
    ...overrides,
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("execução de sincronização abandonada", () => {
  it("mantém intacta uma execução recente ainda em andamento", async () => {
    const execucao = execucaoBase({ iniciadoEm: new Date(Date.now() - 2 * 60_000) });
    const resultado = await obterUltimaSincronizacaoConta(contextoCom(execucao), "conta-1");

    expect(resultado?.pedidosStatus).toBe("em_andamento");
    expect(resultado?.finalizadoEm).toBeNull();
  });

  it("apresenta como falha a execução parada além do limite", async () => {
    const execucao = execucaoBase({ iniciadoEm: new Date(Date.now() - 45 * 60_000) });
    const resultado = await obterUltimaSincronizacaoConta(contextoCom(execucao), "conta-1");

    expect(resultado?.pedidosStatus).toBe("erro");
    expect(resultado?.pedidosErro).toMatch(/parou de responder/);
    // Módulo que nem chegou a começar também não pode ficar "na fila" pra sempre.
    expect(resultado?.anunciosStatus).toBe("erro");
    // O que já tinha concluído é preservado — não vira falha retroativa.
    expect(resultado?.catalogoStatus).toBe("concluido");
    expect(resultado?.finalizadoEm).toBeInstanceOf(Date);
  });

  it("não mexe em execução que já terminou, por mais antiga que seja", async () => {
    const execucao = execucaoBase({
      iniciadoEm: new Date(Date.now() - 30 * 24 * 60 * 60_000),
      finalizadoEm: new Date(Date.now() - 30 * 24 * 60 * 60_000 + 60_000),
      pedidosStatus: "concluido",
    });
    const resultado = await obterUltimaSincronizacaoConta(contextoCom(execucao), "conta-1");

    expect(resultado?.pedidosStatus).toBe("concluido");
  });

  it("devolve null quando a conta nunca sincronizou", async () => {
    expect(await obterUltimaSincronizacaoConta(contextoCom(null), "conta-1")).toBeNull();
  });
});
