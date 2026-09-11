import { fireEvent, render, screen } from "@testing-library/react";
import { CircleDollarSign } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import { CardResumoVendas } from "@/app/(dashboard)/vendas/pedidos/card-resumo-vendas";

class ResizeObserverMock implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver ??= ResizeObserverMock;

describe("cards de conferência de Vendas", () => {
  it("abre os pedidos pelo card e mantém a explicação independente", async () => {
    const abrir = vi.fn();
    render(<CardResumoVendas label="Reembolsos parciais" valor="R$ 121,39" icon={CircleDollarSign} cor="orange" onClick={abrir}
      explicacao={{ titulo: "os reembolsos", descricao: "Parcela devolvida.", calculo: "Soma das parcelas.", inclui: [], naoInclui: [] }} />);
    fireEvent.click(screen.getByRole("button", { name: /Reembolsos parciais/ }));
    expect(abrir).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Entenda os reembolsos" }));
    expect(await screen.findByText("Parcela devolvida.")).toBeInTheDocument();
    expect(abrir).toHaveBeenCalledOnce();
  });
  it("abre no toque uma explicação com cálculo, entradas e exclusões", async () => {
    render(
      <CardResumoVendas
        label="Total bruto comparável"
        valor="R$ 63.507,77"
        icon={CircleDollarSign}
        cor="green"
        explicacao={{
          titulo: "o total bruto comparável",
          descricao: "Valor usado para comparar com o canal.",
          calculo: "Confirmado mais cancelado mais reembolso parcial.",
          inclui: ["Pedidos com pagamento confirmado."],
          naoInclui: ["Pedidos sem pagamento confirmado."],
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Entenda o total bruto comparável" }));
    expect(await screen.findByText("Cálculo")).toBeInTheDocument();
    expect(screen.getByText("O que entra")).toBeInTheDocument();
    expect(screen.getByText("O que não entra")).toBeInTheDocument();
    expect(screen.getByText("Confirmado mais cancelado mais reembolso parcial.")).toBeInTheDocument();
  });
});
