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

  it("explica o ROAS de forma didática e dinâmica", async () => {
    render(<KpisPrincipais resumo={resumo()} />);

    fireEvent.click(screen.getByRole("button", { name: "Explicar indicador ROAS" }));

    expect(await screen.findByText(/ROAS atual: 4,00x/i)).toBeInTheDocument();
    expect(screen.getByText(/ROAS é a receita atribuída dividida pelo investimento em anúncios/i)).toBeInTheDocument();
    expect(screen.getByText(/cada R\$ 1,00 investido voltou como R\$ 4,00/i)).toBeInTheDocument();
    expect(screen.getByText(/acima de 1,00x, a mídia se pagou/i)).toBeInTheDocument();
  });

  it("explica receita atribuída com observação sobre o que é receita", async () => {
    render(<KpisPrincipais resumo={resumo()} />);

    fireEvent.click(screen.getByRole("button", { name: "Explicar indicador Receita atribuída" }));

    expect(await screen.findByText(/Receita atribuída atual: R\$\s*4\.800,00/i)).toBeInTheDocument();
    expect(screen.getByText(/32 vendas atribuídas aos anúncios/i)).toBeInTheDocument();
    expect(screen.getByText(/média de R\$\s*150,00 por venda/i)).toBeInTheDocument();
    expect(screen.getByText("Observação")).toBeInTheDocument();
    expect(screen.getByText(/Receita, nesta tela, é o valor total vendido/i)).toBeInTheDocument();
    expect(screen.getByText(/Não é lucro/i)).toBeInTheDocument();
  });

  it("explica vendas atribuídas com leitura de conversão e observação", async () => {
    render(<KpisPrincipais resumo={resumo()} />);

    fireEvent.click(screen.getByRole("button", { name: "Explicar indicador Vendas atribuídas" }));

    expect(await screen.findByText(/Vendas atribuídas atual: 32/i)).toBeInTheDocument();
    expect(screen.getByText(/a plataforma conectou aos anúncios/i)).toBeInTheDocument();
    expect(screen.getByText(/Com 650 cliques, isso representa CVR de 4,9%/i)).toBeInTheDocument();
    expect(screen.getByText(/o tráfego virou venda real/i)).toBeInTheDocument();
    expect(screen.getByText("Observação")).toBeInTheDocument();
    expect(screen.getByText(/não quer dizer que o anúncio foi o único motivo da compra/i)).toBeInTheDocument();
  });

  it("explica CTR com fórmula, leitura prática e observação", async () => {
    render(<KpisPrincipais resumo={resumo()} />);

    fireEvent.click(screen.getByRole("button", { name: "Explicar indicador CTR" }));

    expect(await screen.findByText(/CTR atual: 1,6%/i)).toBeInTheDocument();
    expect(screen.getByText(/CTR é cliques divididos por impressões/i)).toBeInTheDocument();
    expect(screen.getByText(/de 42\.000 exibições, 650 viraram clique/i)).toBeInTheDocument();
    expect(screen.getByText(/15,5 cliques a cada 1\.000 impressões/i)).toBeInTheDocument();
    expect(screen.getByText(/bom sinal de interesse/i)).toBeInTheDocument();
    expect(screen.getByText("Observação")).toBeInTheDocument();
    expect(screen.getByText(/CTR não mede venda/i)).toBeInTheDocument();
  });

  it("explica CPC médio com fórmula, leitura prática e observação", async () => {
    render(<KpisPrincipais resumo={resumo()} />);

    fireEvent.click(screen.getByRole("button", { name: "Explicar indicador CPC médio" }));

    expect(await screen.findByText(/CPC médio atual: R\$\s*1,85/i)).toBeInTheDocument();
    expect(screen.getByText(/CPC é o investimento em anúncios dividido pelos cliques/i)).toBeInTheDocument();
    expect(screen.getByText(/R\$\s*1\.200,00 dividido por 650 cliques/i)).toBeInTheDocument();
    expect(screen.getByText(/cada visita gerada pelo anúncio custou R\$\s*1,85/i)).toBeInTheDocument();
    expect(screen.getByText(/faixa intermediária/i)).toBeInTheDocument();
    expect(screen.getByText("Observação")).toBeInTheDocument();
    expect(screen.getByText(/Clique não é venda/i)).toBeInTheDocument();
  });

  it("explica CVR com fórmula, leitura de conversão e observação", async () => {
    render(<KpisPrincipais resumo={resumo()} />);

    fireEvent.click(screen.getByRole("button", { name: "Explicar indicador CVR" }));

    expect(await screen.findByText(/CVR atual: 4,9%/i)).toBeInTheDocument();
    expect(screen.getByText(/CVR é vendas atribuídas divididas pelos cliques/i)).toBeInTheDocument();
    expect(screen.getByText(/32 vendas a partir de 650 cliques/i)).toBeInTheDocument();
    expect(screen.getByText(/4,9 vendas a cada 100 cliques/i)).toBeInTheDocument();
    expect(screen.getByText(/bom sinal/i)).toBeInTheDocument();
    expect(screen.getByText("Observação")).toBeInTheDocument();
    expect(screen.getByText(/Conversão é quando esse clique vira venda atribuída/i)).toBeInTheDocument();
  });
});
