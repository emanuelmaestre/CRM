import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PedidosIndicadorDialog } from "@/app/(dashboard)/vendas/pedidos/pedidos-indicador-dialog";
import { actionListarPedidosDoIndicador } from "@/app/(dashboard)/vendas/actions";

vi.mock("@/app/(dashboard)/vendas/actions", () => ({ actionListarPedidosDoIndicador: vi.fn() }));
const consultar = vi.mocked(actionListarPedidosDoIndicador);
const filtros = { canais: ["mercadolivre"], busca: "Ana", inicio: "2026-09-05T00:00:00-03:00" };
const pedido = (id: string) => ({ id, providerOrderId: `ML-${id}`, clienteNome: "Ana", canal: "mercadolivre", status: "pago" as const, total: 100, valorReembolsado: 12.5, createdAt: new Date("2026-09-05T13:00:00Z") });

beforeEach(() => consultar.mockReset());

describe("pedidos dos indicadores", () => {
  it("busca o recorte completo e carrega a próxima página sem perder os links anteriores", async () => {
    consultar.mockResolvedValueOnce({ data: Array.from({ length: 50 }, (_, i) => pedido(String(i))), hasMore: true })
      .mockResolvedValueOnce({ data: [pedido("50")], hasMore: false });
    render(<PedidosIndicadorDialog indicador="reembolsos-parciais" titulo="Reembolsos parciais" filtros={filtros} quantidade={51} valor={637.5} onClose={vi.fn()} />);
    expect(await screen.findByRole("link", { name: /ML-0 / })).toHaveAttribute("href", "/vendas/pedidos/0");
    expect(consultar).toHaveBeenCalledWith("reembolsos-parciais", { ...filtros, offset: 0 });
    /* 50 linhas + o resumo: a média por pedido do recorte (637,50 / 51) cai
       exatamente em 12,50, o mesmo valor reembolsado de cada pedido do mock. */
    expect(screen.getAllByText("R$ 12,50")).toHaveLength(51);
    fireEvent.click(screen.getByRole("button", { name: "Carregar mais pedidos" }));
    expect(await screen.findByRole("link", { name: /ML-50 / })).toHaveAttribute("href", "/vendas/pedidos/50");
    expect(consultar).toHaveBeenLastCalledWith("reembolsos-parciais", { ...filtros, offset: 50 });
    expect(screen.getAllByRole("link")).toHaveLength(51);
    expect(screen.queryByRole("button", { name: "Carregar mais pedidos" })).not.toBeInTheDocument();
  });

  it("permite tentar novamente e mostra cancelamento com valor integral", async () => {
    consultar.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ data: [{ ...pedido("1"), status: "cancelado" }], hasMore: false });
    render(<PedidosIndicadorDialog indicador="cancelados-devolvidos" titulo="Cancelados e devolvidos" filtros={filtros} quantidade={1} valor={100} onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: "Tentar novamente" }));
    await screen.findByRole("link");
    expect(screen.queryByText("R$ 12,50")).not.toBeInTheDocument();
    /* Total do resumo, média por pedido, subtotal do dia, valor original e
       valor cancelado da linha. */
    expect(screen.getAllByText("R$ 100,00")).toHaveLength(5);
    expect(consultar).toHaveBeenLastCalledWith("cancelados-devolvidos", { ...filtros, offset: 0 });
  });

  it("exibe o estado vazio e fecha pelo botão da janela", async () => {
    consultar.mockResolvedValue({ data: [], hasMore: false });
    const fechar = vi.fn();
    render(<PedidosIndicadorDialog indicador="reembolsos-parciais" titulo="Reembolsos parciais" filtros={filtros} quantidade={0} valor={0} onClose={fechar} />);
    await screen.findByText("Nenhum pedido neste indicador para os filtros selecionados.");
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    await waitFor(() => expect(fechar).toHaveBeenCalledOnce());
  });
});
