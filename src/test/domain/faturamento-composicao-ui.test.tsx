import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FaturamentoCard } from "@/app/(dashboard)/metricas/painel/faturamento-card";
import type { FaturamentoResumo } from "@/modules/metricas/application/dashboard.service";

class ResizeObserverMock implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver ??= ResizeObserverMock;

const dados: FaturamentoResumo = {
  granularidade: "dia",
  total: "R$ 75.120,44",
  totalNumerico: 75_120.44,
  variacaoPercentual: 2,
  totalAnteriorNumerico: 73_000,
  totalAnterior: "R$ 73.000,00",
  janelaAnteriorLabel: "01/07 – 30/07",
  pedidos: 1_674,
  ticketMedio: "R$ 44,87",
  serie: [
    { label: "01/08", valor: 30_000, altura: 40 },
    { label: "02/08", valor: 45_120.44, altura: 100 },
  ],
  janelaLabel: "01/08 – 31/08",
  totalLiquidoNumerico: 65_000,
  totalLiquido: "R$ 65.000,00",
  totalAnteriorLiquidoNumerico: 63_000,
  totalAnteriorLiquido: "R$ 63.000,00",
  variacaoPercentualLiquido: 3,
  ticketMedioLiquido: "R$ 38,83",
  serieLiquido: [
    { label: "01/08", valor: 25_000, altura: 40 },
    { label: "02/08", valor: 40_000, altura: 100 },
  ],
  composicao: {
    pedidosBrutosNumerico: 78_681.59,
    pedidosBrutos: "R$ 78.681,59",
    canceladosDevolvidosNumerico: 3_561.15,
    canceladosDevolvidos: "R$ 3.561,15",
  },
};

describe("detalhamento aditivo do faturamento", () => {
  it("mantém o card principal e mostra a composição somente dentro do Entenda", async () => {
    const acaoSlot = document.createElement("div");
    document.body.appendChild(acaoSlot);
    const aoTrocarLiquido = vi.fn();

    render(
      <FaturamentoCard
        dados={dados}
        carregando={false}
        semFiltro={false}
        acaoSlot={acaoSlot}
        liquido={false}
        aoTrocarLiquido={aoTrocarLiquido}
      />,
    );

    expect(screen.getAllByText("R$ 75.120,44").length).toBeGreaterThan(0);
    expect(screen.queryByText("Composição no período selecionado")).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Entenda como o faturamento é calculado" })[0]);
    expect(await screen.findByText("Composição no período selecionado")).toBeInTheDocument();
    expect(screen.getByText("R$ 78.681,59")).toBeInTheDocument();
    expect(screen.getByText(/R\$ 3\.561,15/)).toBeInTheDocument();
    acaoSlot.remove();
  });
});
