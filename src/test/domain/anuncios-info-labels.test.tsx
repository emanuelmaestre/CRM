import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { KpisPrincipais } from "@/app/(dashboard)/anuncios/kpis-principais";
import type { VisaoGeralResumo } from "@/modules/anuncios/application/visao-geral.service";

class ResizeObserverMock implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver ??= ResizeObserverMock;

function resumo(): VisaoGeralResumo {
  return {
    investimentoTotal: 1200,
    receitaTotal: 4800,
    roasMedio: 4,
    acosMedio: 25,
    tacos: 12.5,
    vendasPublicitarias: 32,
    vendasOrganicas: 18,
    receitaOrganica: 5200,
    cliques: 650,
    impressoes: 42_000,
    vendas: 32,
    dependenciaMidia: { percentual: 48, classificacao: "moderada" },
    cvrMedio: 4.9,
    ctrMedio: 1.55,
    cpcMedio: 1.85,
  };
}

describe("rótulos de Anúncios com informação", () => {
  it("mostra um ícone explicativo ao lado de cada KPI principal e secundário", async () => {
    render(<KpisPrincipais resumo={resumo()} />);

    expect(screen.getAllByRole("button", { name: /Explicar indicador/i })).toHaveLength(11);
    expect(screen.getByRole("button", { name: "Explicar indicador Investimento" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Explicar indicador Receita atribuída" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Explicar indicador ROAS" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Explicar indicador Vendas atribuídas" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Explicar indicador Investimento" }).getAttribute("title")).toMatch(/R\$\s*1\.200,00/);

    fireEvent.click(screen.getByRole("button", { name: "Explicar indicador ACOS" }));

    expect(await screen.findByText(/ACOS atual: 25,0%/i)).toBeInTheDocument();
    expect(screen.getByText(/A cada R\$ 100,00 de receita atribuída/i)).toBeInTheDocument();
  });
});
