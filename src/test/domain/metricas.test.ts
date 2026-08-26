import { afterEach, describe, expect, it, vi } from "vitest";
import { MercadoLivreProvider } from "@/modules/canais/infrastructure/mercadolivre.provider";
import { FAIXAS_SCORE, PILARES, faixaDoScore } from "@/modules/metricas/application/saude-loja.service";
import { LIMITE_TAXA } from "@/modules/metricas/application/reputacao.service";

describe("reputação do Mercado Livre", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("lê o bloco seller_reputation que já vem em /users/me, sem chamada extra", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: 777,
      nickname: "LOJA-TESTE",
      points: 1200,
      seller_reputation: {
        level_id: "5_green",
        power_seller_status: "platinum",
        transactions: { completed: 4200, ratings: { positive: 0.98, neutral: 0.011, negative: 0.009 } },
        metrics: {
          claims: { period: "365 days", rate: 0.0123, value: 52 },
          cancellations: { period: "365 days", rate: 0.004, value: 17 },
          delayed_handling_time: { period: "365 days", rate: 0.1812, value: 760 },
          sales: { period: "365 days", completed: 4200 },
        },
      },
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new MercadoLivreProvider({
      clientId: "client", clientSecret: "secret", accessToken: "token", refreshToken: "refresh",
    });
    const reputacao = await provider.obterReputacao();

    // Uma requisição só: o custo desta métrica é a leitura de campos que já
    // chegavam na resposta e eram descartados.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain("/users/me");

    expect(reputacao).toMatchObject({
      sellerId: "777",
      nivelId: "5_green",
      statusMercadoLider: "platinum",
      vendasConcluidas: 4200,
    });
    // Fração vira percentual uma vez só, aqui — a UI nunca precisa saber disso.
    expect(reputacao.taxaReclamacao).toBe(1.2);
    expect(reputacao.taxaCancelamento).toBe(0.4);
    expect(reputacao.taxaAtrasoEnvio).toBe(18.1);
    expect(reputacao.avaliacaoPositiva).toBe(98);
  });

  it("devolve null em vez de zero quando a conta ainda não tem histórico", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 42, nickname: "NOVA" }), { status: 200 }),
    ));

    const provider = new MercadoLivreProvider({
      clientId: "c", clientSecret: "s", accessToken: "t", refreshToken: "r",
    });
    const reputacao = await provider.obterReputacao();

    // Conta nova sem termômetro não é "reputação zero": é reputação inexistente.
    // Confundir os dois faria a loja recém-conectada aparecer como a pior.
    expect(reputacao.nivelId).toBeNull();
    expect(reputacao.taxaReclamacao).toBeNull();
    expect(reputacao.vendasConcluidas).toBeNull();
  });
});

describe("desempenho das publicações no Mercado Livre", () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it("normaliza visitas de vários anúncios no período", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([{ item_id: "MLB1", total_visits: 120 }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ item_id: "MLB2", total_visits: 45 }]), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const provider = new MercadoLivreProvider({ clientId: "c", clientSecret: "s", accessToken: "t", refreshToken: "r" });

    await expect(provider.obterVisitasItens(["MLB1", "MLB2"], "2026-08-01", "2026-08-15"))
      .resolves.toEqual([{ itemId: "MLB1", total: 120 }, { itemId: "MLB2", total: 45 }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain("ids=MLB1");
    expect(String(fetchMock.mock.calls[1][0])).toContain("ids=MLB2");
  });

  it("extrai score e pendências da qualidade da publicação", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      entity_id: "MLBU1", score: 66, level_wording: "Satisfatória", calculated_at: "2026-08-15T10:00:00Z",
      buckets: [{ variables: [{ status: "PENDING", title: "Melhore as fotos", rules: [{ status: "PENDING", wordings: { title: "Adicione mais fotos" } }] }] }],
    }), { status: 200 })));
    const provider = new MercadoLivreProvider({ clientId: "c", clientSecret: "s", accessToken: "t", refreshToken: "r" });

    await expect(provider.obterPerformanceItem("MLB1")).resolves.toMatchObject({
      itemId: "MLB1", entityId: "MLBU1", score: 66, nivel: "Satisfatória", pendencias: ["Adicione mais fotos"],
    });
  });
});

describe("faixas do score de saúde", () => {
  it("cobre a escala inteira sem buraco entre as faixas", () => {
    for (let score = 0; score <= 100; score += 1) {
      expect(faixaDoScore(score)).toBeDefined();
    }
    expect(faixaDoScore(100).label).toBe("Excelente");
    expect(faixaDoScore(0).label).toBe("Crítico");
    // Os cortes são decrescentes: a busca por "primeiro mínimo atingido" só
    // funciona enquanto essa ordem se mantiver.
    const minimos = FAIXAS_SCORE.map((faixa) => faixa.minimo);
    expect([...minimos].sort((a, b) => b - a)).toEqual([...minimos]);
  });

  it("mantém os pesos dos pilares somando 100", () => {
    expect(PILARES.reduce((soma, pilar) => soma + pilar.peso, 0)).toBe(100);
    expect(new Set(PILARES.map((pilar) => pilar.chave)).size).toBe(PILARES.length);
  });

  it("mantém um limite declarado para cada taxa de reputação", () => {
    expect(Object.keys(LIMITE_TAXA)).toEqual(["reclamacao", "cancelamento", "atrasoEnvio"]);
    for (const limite of Object.values(LIMITE_TAXA)) expect(limite).toBeGreaterThan(0);
  });
});

