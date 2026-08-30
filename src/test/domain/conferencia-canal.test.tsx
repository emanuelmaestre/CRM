import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { LimiteDoDia, PedidoNoLimite } from "@/shared/components/limite-do-dia";
import { ConferenciaCanal } from "@/app/(dashboard)/vendas/pedidos/conferencia-canal";

/* ── O problema que este bloco resolve ────────────────────────────────────
   O operador abre o painel do Mercado Livre, vê um número, olha o CRM, vê
   outro, e conclui que o CRM está errado. Em 29 e 30/08/2026 essa pergunta
   voltou quatro vezes, e as quatro terminaram na mesma conta feita à mão.

   A conta tem que estar certa, porque agora é ela que fecha a discussão. Se
   uma parcela sair com o sinal trocado, o número final vira mentira com cara
   de prova — pior do que não existir. Daí estes testes. */

function pedidoNaVirada(sobrescreve: Partial<PedidoNoLimite> = {}): PedidoNoLimite {
  return {
    id: "p1",
    providerOrderId: "2000017694473518",
    clienteNome: "Comprador da Virada",
    status: "pago",
    total: 91.8,
    createdAt: new Date("2026-08-01T03:55:00Z"),
    ...sobrescreve,
  };
}

const SEM_VIRADA: LimiteDoDia = { soNoMercadoLivre: [], soAqui: [] };

function montar(props: Partial<React.ComponentProps<typeof ConferenciaCanal>> = {}) {
  return render(
    <ConferenciaCanal
      canais={["mercadolivre"]}
      faturamento={54580.26}
      canceladosValor={1773.41}
      limiteDoDia={SEM_VIRADA}
      pendencias={{ quantidade: 0, valor: 0 }}
      temPeriodo
      {...props}
    />,
  );
}

describe("conferência com o painel do canal", () => {
  it("soma as três parcelas e mostra o número que o painel deve mostrar", async () => {
    // 54.580,26 + 1.773,41 − 91,80 + 58,30 = 56.320,17 — a conta real de
    // WUWU/Mercado Livre em 30/08/2026, com o pedido da virada de 01/08.
    montar({
      limiteDoDia: { soNoMercadoLivre: [], soAqui: [pedidoNaVirada()] },
      pendencias: { quantidade: 2, valor: 58.3 },
    });

    expect(screen.getByText("R$ 56.320,17")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /conferir com o painel/i }));
    await waitFor(() => expect(screen.getByText("Cancelados e devolvidos")).toBeInTheDocument());
    expect(screen.getByText("R$ 1.773,41")).toBeInTheDocument();
    expect(screen.getByText("R$ 91,80")).toBeInTheDocument();
    expect(screen.getByText("R$ 58,30")).toBeInTheDocument();
  });

  /* O sinal é o que separa a conta certa da conta errada pelo dobro do
     valor. Pedido na primeira hora do período o canal conta no dia ANTERIOR:
     ele sai. Pedido na primeira hora do dia seguinte o canal conta aqui
     dentro: ele entra. */
  it("tira da conta o pedido que o canal joga para o dia anterior", () => {
    montar({ limiteDoDia: { soNoMercadoLivre: [], soAqui: [pedidoNaVirada({ total: 100 })] } });
    expect(screen.getByText("R$ 56.253,67")).toBeInTheDocument();
  });

  it("soma na conta o pedido que só o canal conta no período", () => {
    montar({ limiteDoDia: { soNoMercadoLivre: [pedidoNaVirada({ total: 100 })], soAqui: [] } });
    expect(screen.getByText("R$ 56.453,67")).toBeInTheDocument();
  });

  /* `somarLimite`, que o card usa, exclui cancelado — porque lá a comparação
     é com o Faturamento. Aqui o alvo é o bruto do canal, que já soma os
     cancelados: excluí-los desta parcela corrigiria o pedido pela metade. */
  it("corrige a virada do dia mesmo quando o pedido está cancelado", () => {
    montar({
      limiteDoDia: { soNoMercadoLivre: [], soAqui: [pedidoNaVirada({ total: 100, status: "cancelado" })] },
    });
    expect(screen.getByText("R$ 56.253,67")).toBeInTheDocument();
  });

  it("não inventa fuso em canal que não é o Mercado Livre", async () => {
    montar({
      canais: ["shopee"],
      limiteDoDia: { soNoMercadoLivre: [], soAqui: [pedidoNaVirada({ total: 100 })] },
    });
    expect(screen.getByText("R$ 56.353,67")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /conferir com o painel/i }));
    await waitFor(() => expect(screen.getByText("Cancelados e devolvidos")).toBeInTheDocument());
    expect(screen.queryByText("Virada do dia")).not.toBeInTheDocument();
  });

  /* Com dois canais na tela não existe "o painel do canal" para comparar, e
     somar Mercado Livre com Shopee ainda mistura réguas (um conta produto,
     o outro conta o que o comprador pagou). Calar é a resposta certa. */
  it("não aparece sem exatamente um canal escolhido", () => {
    const { container: doisCanais } = montar({ canais: ["mercadolivre", "shopee"] });
    expect(doisCanais).toBeEmptyDOMElement();

    const { container: nenhum } = montar({ canais: [] });
    expect(nenhum).toBeEmptyDOMElement();
  });

  it("sem período não promete número nenhum", () => {
    montar({ temPeriodo: false });
    expect(screen.getByText(/Escolha um período/)).toBeInTheDocument();
    expect(screen.queryByText(/Esperado no painel/)).not.toBeInTheDocument();
  });

  /* Das três parcelas, só esta é problema de verdade — e ela precisa levar a
     pessoa ao lugar onde se resolve, senão vira só mais um número. */
  it("leva para a fila quando há pedido fora do CRM", async () => {
    montar({ pendencias: { quantidade: 2, valor: 58.3 } });
    fireEvent.click(screen.getByRole("button", { name: /conferir com o painel/i }));

    await waitFor(() => expect(screen.getByRole("link", { name: /resolver agora/i })).toBeInTheDocument());
    expect(screen.getByRole("link", { name: /resolver agora/i })).toHaveAttribute("href", "/vendas/pedidos-ignorados");
    expect(screen.getByText(/2 vendas que o canal registrou/)).toBeInTheDocument();
  });

  it("fila vazia não vira alarme falso", async () => {
    montar();
    fireEvent.click(screen.getByRole("button", { name: /conferir com o painel/i }));

    await waitFor(() => expect(screen.getByText(/Nenhuma venda do período ficou de fora/)).toBeInTheDocument());
    expect(screen.queryByRole("link", { name: /resolver agora/i })).not.toBeInTheDocument();
  });
});
