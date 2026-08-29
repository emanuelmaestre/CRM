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
    compradorUsuario: "mariasouza",
    compradorTelefone: "******41",
    total: "89.90",
    frete: "12.30",
    desconto: "5.00",
    acrescimo: "0.00",
    valorLiquido: "63.45",
    statusCanal: "completed",
    itens: [{ sku: "W613-BL", quantidade: 2, precoUnitario: "41.30", taxaMarketplace: "9.45" }],
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
    expect(screen.getByText(/nenhum pedido ficou de fora/i)).toBeInTheDocument();
  });

  /* A tela agrupa por causa justamente para NÃO repetir a explicação em cada
     linha. Estes testes travam essa economia: ela é invisível com um pedido
     só e some sem barulho se alguém voltar a renderizar o texto por item. */
  it("explica a causa uma vez só, mesmo com vários pedidos do mesmo motivo", () => {
    render(
      <PedidosIgnoradosLista
        linhas={[
          linha({ id: "a", providerOrderId: "AAA" }),
          linha({ id: "b", providerOrderId: "BBB" }),
          linha({ id: "c", providerOrderId: "CCC" }),
        ]}
        podeDescartar
        incluirFechados={false}
      />,
    );
    expect(screen.getAllByText("Motivo")).toHaveLength(1);
    expect(screen.getAllByText("O que fazer")).toHaveLength(1);
    expect(screen.getByText("AAA")).toBeInTheDocument();
    expect(screen.getByText("CCC")).toBeInTheDocument();
  });

  it("separa as causas em grupos e diz onde cada uma se resolve", () => {
    render(
      <PedidosIgnoradosLista
        linhas={[
          linha({ id: "a", causa: "sku_sem_produto" }),
          linha({ id: "b", causa: "cliente_duplicado", providerOrderId: "BBB" }),
        ]}
        podeDescartar
        incluirFechados={false}
      />,
    );
    expect(screen.getByText("SKU sem produto")).toBeInTheDocument();
    expect(screen.getByText("Cliente duplicado")).toBeInTheDocument();
    expect(screen.getByText("Sai sozinho")).toBeInTheDocument();
    expect(screen.getByText("Depende de você")).toBeInTheDocument();
  });

  it("soma o dinheiro parado na fila — é o motivo de a tela existir", () => {
    render(
      <PedidosIgnoradosLista
        linhas={[
          linha({ id: "a", total: "89.90" }),
          linha({ id: "b", total: "10.10", providerOrderId: "BBB" }),
        ]}
        podeDescartar
        incluirFechados={false}
      />,
    );
    expect(screen.getByText(/100,00/)).toBeInTheDocument();
  });

  it("não conta pedido descartado como dinheiro parado", () => {
    render(
      <PedidosIgnoradosLista
        linhas={[
          linha({ id: "a", total: "89.90" }),
          linha({ id: "b", total: "500.00", providerOrderId: "BBB", descartadoEm: new Date() }),
        ]}
        podeDescartar
        incluirFechados
      />,
    );
    expect(screen.getByText(/1 pedido fora do CRM/)).toBeInTheDocument();
    expect(screen.queryByText(/589,90/)).not.toBeInTheDocument();
  });

  /* O payload do pedido recusado e gravado inteiro, mas a tela so lia tres
     campos dele. O resto — repasse, frete, taxa, status no canal — ficava
     invisivel, e quem precisava decidir sobre um pedido tinha de abrir o
     painel do marketplace. */
  it("abre os detalhes com o financeiro completo do pedido", async () => {
    render(<PedidosIgnoradosLista linhas={[linha()]} podeDescartar incluirFechados={false} />);

    // Fechado por padrao: a fila existe para ser varrida rapido.
    expect(screen.queryByText("Repasse")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /ver detalhes/i }));

    await waitFor(() => expect(screen.getByText("Repasse")).toBeInTheDocument());
    expect(screen.getByText("R$ 63,45")).toBeInTheDocument();
    expect(screen.getByText("R$ 12,30")).toBeInTheDocument();
    expect(screen.getByText("mariasouza")).toBeInTheDocument();
    expect(screen.getByText(/2 un\./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ocultar detalhes/i })).toBeInTheDocument();
  });

  /* O status chega cru do canal ("completed"). Mostrar assim seria um segundo
     vocabulario para o mesmo pedido, diferente do que Vendas usa. */
  it("traduz o status do canal em vez de mostrar o termo cru", async () => {
    render(<PedidosIgnoradosLista linhas={[linha()]} podeDescartar incluirFechados={false} />);
    fireEvent.click(screen.getByRole("button", { name: /ver detalhes/i }));

    await waitFor(() => expect(screen.getByText(/Concluído no canal/)).toBeInTheDocument());
    expect(screen.queryByText(/completed/i)).not.toBeInTheDocument();
  });

  /* Pedido cancelado na origem nunca vira receita. Sem esse aviso, alguem
     gasta tempo recuperando um pedido que nao existe mais — foi o caso de um
     dos tres pedidos reais da fila em 28/08/2026. */
  it("avisa quando o pedido ja foi cancelado no canal", async () => {
    render(
      <PedidosIgnoradosLista
        linhas={[linha({ statusCanal: "cancelled" })]}
        podeDescartar
        incluirFechados={false}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /ver detalhes/i }));

    await waitFor(() => expect(screen.getByText(/Cancelado no canal/)).toBeInTheDocument());
    expect(screen.getByText(/nao vira receita/i)).toBeInTheDocument();
  });

  /* Sem payload (pendencia antiga, gravada antes destes campos) a tela nao
     pode quebrar nem mostrar "R$ NaN". */
  it("aguenta pendencia sem financeiro guardado", async () => {
    render(
      <PedidosIgnoradosLista
        linhas={[linha({
          total: null, frete: null, desconto: null, acrescimo: null,
          valorLiquido: null, statusCanal: null, itens: [],
          compradorUsuario: null, compradorTelefone: null,
        })]}
        podeDescartar
        incluirFechados={false}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /ver detalhes/i }));

    await waitFor(() => expect(screen.getByText("Repasse")).toBeInTheDocument());
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
  });

});
