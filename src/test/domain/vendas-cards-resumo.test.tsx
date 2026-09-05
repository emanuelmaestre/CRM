import { fireEvent, render, screen } from "@testing-library/react";
import { CircleDollarSign } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import { CardResumoVendas } from "@/app/(dashboard)/vendas/pedidos/card-resumo-vendas";
import { CardLimiteDoDia, pedidoEntraNoBruto, somarLimite } from "@/shared/components/limite-do-dia";

class ResizeObserverMock implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver ??= ResizeObserverMock;

describe("cards de conferência de Vendas", () => {
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

  it("calcula o fuso sobre o bruto e deixa pedido sem pagamento fora", () => {
    const linhas = [
      { id: "1", providerOrderId: "1", clienteNome: "A", status: "pago", total: 100, pagamentoAprovado: true, createdAt: new Date() },
      { id: "2", providerOrderId: "2", clienteNome: "B", status: "cancelado", total: 20, pagamentoAprovado: true, createdAt: new Date() },
      { id: "3", providerOrderId: "3", clienteNome: "C", status: "devolvido", total: 10, pagamentoAprovado: true, createdAt: new Date() },
      { id: "4", providerOrderId: "4", clienteNome: "D", status: "criado", total: 50, pagamentoAprovado: false, createdAt: new Date() },
      { id: "5", providerOrderId: "5", clienteNome: "E", status: "cancelado", total: 70, pagamentoAprovado: false, createdAt: new Date() },
    ];
    expect(somarLimite(linhas)).toBe(130);
    expect(linhas.filter(pedidoEntraNoBruto)).toHaveLength(3);
  });

  it("mantem o sexto card visivel quando nao existe diferenca de fuso", () => {
    render(
      <CardLimiteDoDia
        dados={{ soNoMercadoLivre: [], soAqui: [] }}
        onClick={vi.fn()}
      />,
    );

    expect(screen.getByText("R$ 0,00")).toBeInTheDocument();
    expect(screen.getByText("0 ped.")).toBeInTheDocument();
  });
});
