import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReposicaoCard } from "@/app/(dashboard)/metricas/painel/listas-cards";
import type { ProdutoReposicao } from "@/modules/metricas/application/dashboard.service";

describe("lista completa na mesma classificação de Métricas", () => {
  it("mostra todos os itens sem navegar para outra régua de estoque", () => {
    const itens: ProdutoReposicao[] = Array.from({ length: 51 }, (_, i) => ({
      produtoId: String(i), sku: `SKU-${i}`, nome: `Produto ${i}`, marca: "karzi", marcaLabel: "KARZI",
      saldo: 2, minimo: 3, coberturaDias: 4, urgencia: 33,
      statusAnuncio: "ativo", motivoStatus: null, canalStatus: "shopee",
    }));
    render(<ReposicaoCard itens={itens} total={51} carregando={false} semFiltro={false} />);
    expect(screen.queryByText("Produto 50")).not.toBeInTheDocument();
    expect(screen.getByText("51 itens no total")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Ver todos no Estoque" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Mostrar mais/ }));
    expect(screen.getByText("Produto 50")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Mostrar mais/ })).not.toBeInTheDocument();
  });
});
