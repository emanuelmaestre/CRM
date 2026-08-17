import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CampanhasCard } from "@/app/(dashboard)/anuncios/campanhas-card";
import type { CampanhaVisaoGeral, VisaoGeralMarca } from "@/modules/anuncios/application/visao-geral.service";

class ResizeObserverMock implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver ??= ResizeObserverMock;

function campanha(overrides: Partial<CampanhaVisaoGeral>): CampanhaVisaoGeral {
  return {
    campanhaId: "campanha-1",
    nome: "Campanha base",
    status: "active",
    criadaEm: "2026-07-01T12:00:00.000Z",
    estrategia: "profitability",
    orcamento: 500,
    roasObjetivo: null,
    investimento: 100,
    receita: 500,
    cliques: 80,
    impressoes: 4000,
    vendas: 8,
    roas: 5,
    acos: 20,
    cvr: 0.1,
    ctr: 0.02,
    vendasDiretas: 6,
    vendasIndiretas: 2,
    vendasOrganicas: 0,
    receitaOrganica: 0,
    sov: null,
    impressionShare: null,
    topImpressionShare: null,
    lostImpressionShareByBudget: null,
    lostImpressionShareByAdRank: null,
    acosBenchmark: null,
    diagnosticos: [],
    oportunidades: [],
    ...overrides,
  };
}

const marca: VisaoGeralMarca = {
  brandId: "brand-1",
  brandSlug: "elisa",
  brandLabel: "Elisa",
  dataSnapshot: "2026-08-17",
  sincronizadoEm: "2026-08-17T12:00:00.000Z",
  resumo: {
    investimentoTotal: 400,
    receitaTotal: 1200,
    roasMedio: 3,
    acosMedio: 33.3,
    tacos: 33.3,
    vendasPublicitarias: 14,
    vendasOrganicas: 0,
    receitaOrganica: 0,
    cliques: 200,
    impressoes: 10000,
    vendas: 14,
    dependenciaMidia: { percentual: 100, classificacao: "critica" },
    cvrMedio: 7,
    ctrMedio: 2,
    cpcMedio: 2,
  },
  campanhas: [],
  alertasIndividuais: [],
  alertasAgrupados: [],
  oportunidades: [],
};

describe("cabeçalhos da tabela de campanhas com informação", () => {
  it("mostra ícone explicativo em cada coluna", () => {
    render(
      <CampanhasCard
        marca={marca}
        campanhas={[
          campanha({ campanhaId: "campanha-1", nome: "Campanha ativa" }),
          campanha({
            campanhaId: "campanha-2",
            nome: "Campanha pausada",
            status: "paused",
            criadaEm: "2026-08-10T12:00:00.000Z",
            orcamento: null,
            investimento: 300,
            receita: 700,
            roas: 2.33,
          }),
        ]}
      />,
    );

    expect(screen.getByRole("button", { name: "Explicar indicador Campanha" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Explicar indicador Status" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Explicar indicador Criada em" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Explicar indicador Orçamento" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Explicar indicador Investido" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Explicar indicador Receita" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Explicar indicador ROAS" })).toBeInTheDocument();
  });

  it("usa descrições dinâmicas nos cabeçalhos de campanhas", async () => {
    render(
      <CampanhasCard
        marca={marca}
        campanhas={[
          campanha({ campanhaId: "campanha-1", nome: "Campanha ativa" }),
          campanha({
            campanhaId: "campanha-2",
            nome: "Campanha pausada",
            status: "paused",
            criadaEm: "2026-08-10T12:00:00.000Z",
            orcamento: null,
            investimento: 300,
            receita: 700,
            roas: 2.33,
          }),
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Explicar indicador Status" }));

    expect(await screen.findByText(/1 ativa, 1 pausada/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Explicar indicador Orçamento" }));

    expect(await screen.findByText(/1 de 2 campanhas têm orçamento informado/i)).toBeInTheDocument();
    expect(screen.getByText(/somando R\$\s*500,00/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Explicar indicador ROAS" }));

    expect(await screen.findByText(/cada R\$\s*1,00 investido voltou como R\$\s*3,00/i)).toBeInTheDocument();
    expect(screen.getByText(/3,00x/i)).toBeInTheDocument();
  });
});
