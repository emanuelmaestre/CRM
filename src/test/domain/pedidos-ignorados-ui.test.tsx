import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { PedidoIgnoradoLinha } from "@/modules/vendas/application/pedidos-ignorados.service";

const reprocessar = vi.fn();
const descartar = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/app/(dashboard)/vendas/pedidos-ignorados/actions", () => ({
  actionReprocessarPedidoIgnorado: (...args: unknown[]) => reprocessar(...args),
  actionDescartarPedidoIgnorado: (...args: unknown[]) => descartar(...args),
}));

const { PedidosIgnoradosLista } = await import(
  "@/app/(dashboard)/vendas/pedidos-ignorados/pedidos-ignorados-lista"
);

function linha(sobrescreve: Partial<PedidoIgnoradoLinha> = {}): PedidoIgnoradoLinha {
  return {
    id: "linha-1",
    providerOrderId: "250814ABC",
    causa: "sku_sem_produto",
    motivo: "SKU W613-BL sem produto na marca",
    skus: ["W613-BL"],
    marca: "WUWU",
    marcaSlug: "wuwu",
    canal: "shopee",
    tentativas: 3,
    primeiraVezEm: new Date("2026-08-14T10:00:00Z"),
    ultimaVezEm: new Date("2026-08-27T10:00:00Z"),
    descartadoEm: null,
    compradorNome: "Maria Souza",
    total: "89.90",
    pedidoEm: "2026-08-14T10:00:00Z",
    reprocessavel: true,
    ...sobrescreve,
  };
}

beforeEach(() => {
  reprocessar.mockReset();
  descartar.mockReset();
  refresh.mockReset();
});

describe("fila de pedidos ignorados", () => {
  it("mostra o pedido com comprador, valor e SKU que faltou", () => {
    render(<PedidosIgnoradosLista linhas={[linha()]} podeDescartar incluirFechados={false} />);
    expect(screen.getByText("250814ABC")).toBeInTheDocument();
    expect(screen.getByText("Maria Souza")).toBeInTheDocument();
    expect(screen.getByText("W613-BL")).toBeInTheDocument();
  });

  /* O bug que este teste tranca: a primeira versão guardava a lista em
     `useState` e removia a linha da tela depois de QUALQUER ação, inclusive
     quando o reprocessamento falhava. A pendência sumia sem ter saído da
     fila e reaparecia no próximo carregamento. */
  it("replay que falha mantém a linha na tela e busca o estado real", async () => {
    reprocessar.mockResolvedValue({ ok: false, motivo: "SKU W613-BL sem produto na marca" });
    render(<PedidosIgnoradosLista linhas={[linha()]} podeDescartar incluirFechados={false} />);

    fireEvent.click(screen.getByRole("button", { name: /tentar novamente/i }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(screen.getByText("250814ABC")).toBeInTheDocument();
  });

  it("replay que dá certo também pede o estado ao servidor, não adivinha", async () => {
    reprocessar.mockResolvedValue({ ok: true, jaExistia: false });
    render(<PedidosIgnoradosLista linhas={[linha()]} podeDescartar incluirFechados={false} />);

    fireEvent.click(screen.getByRole("button", { name: /tentar novamente/i }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  /* payload_invalido é bug do CRM: reprocessar daria o mesmo erro. */
  it("não oferece 'tentar novamente' quando a falha é determinística", () => {
    render(<PedidosIgnoradosLista
      linhas={[linha({ causa: "payload_invalido", reprocessavel: false })]}
      podeDescartar
      incluirFechados={false}
    />);
    expect(screen.queryByRole("button", { name: /tentar novamente/i })).not.toBeInTheDocument();
    expect(screen.getByText(/é problema do CRM/i)).toBeInTheDocument();
  });

  it("quem não pode descartar não vê o botão", () => {
    render(<PedidosIgnoradosLista linhas={[linha()]} podeDescartar={false} incluirFechados={false} />);
    expect(screen.queryByRole("button", { name: /não recuperável/i })).not.toBeInTheDocument();
  });

  it("linha já descartada oferece devolver à fila, não descartar de novo", () => {
    render(<PedidosIgnoradosLista
      linhas={[linha({ descartadoEm: new Date("2026-08-26T10:00:00Z") })]}
      podeDescartar
      incluirFechados
    />);
    expect(screen.getByRole("button", { name: /devolver à fila/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /não recuperável/i })).not.toBeInTheDocument();
  });

  it("fila vazia não é erro — é a operação saudável", () => {
    render(<PedidosIgnoradosLista linhas={[]} podeDescartar incluirFechados={false} />);
    expect(screen.getByText(/nenhum pedido ignorado/i)).toBeInTheDocument();
  });
});
