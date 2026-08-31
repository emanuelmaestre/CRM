import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ConferenciaCanal } from "@/app/(dashboard)/vendas/pedidos/conferencia-canal";

const oficial = {
  status: "ok" as const,
  faturamento: 1000,
  pedidosValidos: 8,
  canceladosValor: 50,
  canceladosQtd: 1,
  totalBruto: 1050,
  totalPedidos: 9,
  contasConsultadas: 1,
  consultadoEm: "2026-08-30T20:15:00.000Z",
};

function montar(props: Partial<React.ComponentProps<typeof ConferenciaCanal>> = {}) {
  return render(<ConferenciaCanal canais={["mercadolivre"]} faturamento={1000} faturamentoOficial={oficial} canceladosValor={50} pendencias={{ quantidade: 0, valor: 0 }} periodo={{ inicio: "2026-08-24", fim: "2026-08-30" }} {...props} />);
}

function abrir(nome: RegExp = /mercado livre ao vivo/i) {
  fireEvent.click(screen.getByRole("button", { name: nome }));
}

describe("faturamento oficial do Mercado Livre", () => {
  it("mostra o valor ao vivo da API oficial no cabeçalho", () => {
    montar();
    expect(screen.getByText(/API oficial de pedidos/)).toBeInTheDocument();
    expect(screen.getByTestId("faturamento-oficial-mercadolivre")).toHaveTextContent(/R\$\s*1\.000,00/);
    expect(screen.queryByText(/Faturamento atual no CRM/)).not.toBeInTheDocument();
  });

  it("identifica as datas exatas e o fuso", () => {
    montar();
    expect(screen.getByText(/24\/08\/2026 a 30\/08\/2026 · horário de Brasília/)).toBeInTheDocument();
  });

  it("compara o valor oficial com o CRM e confirma igualdade", () => {
    montar();
    abrir();
    expect(screen.getByText("CRM neste recorte")).toBeInTheDocument();
    expect(screen.getByTestId("diferenca-faturamento")).toHaveTextContent(/R\$\s*0,00/);
    expect(screen.getByText(/está igual ao Mercado Livre neste momento/)).toBeInTheDocument();
  });

  it("mantém uma divergência visível para auditoria", () => {
    montar({ faturamento: 975 });
    abrir();
    expect(screen.getByTestId("diferenca-faturamento")).toHaveTextContent(/-R\$\s*25,00/);
    expect(screen.getByText(/diferença de R\$\s*25,00.*permanece sinalizada/)).toBeInTheDocument();
  });

  it("não calcula diferença contra um CRM restringido por busca ou status", () => {
    montar({ temFiltrosAdicionais: true });
    abrir();
    expect(screen.queryByTestId("diferenca-faturamento")).not.toBeInTheDocument();
    expect(screen.getByText(/Limpe esses filtros para calcular a diferença/)).toBeInTheDocument();
  });

  it("não reutiliza valor antigo se a consulta oficial ficar indisponível", () => {
    montar({ faturamentoOficial: { status: "indisponivel", mensagem: "Canal temporariamente indisponível." } });
    expect(screen.getByTestId("faturamento-oficial-mercadolivre")).toHaveTextContent("Indisponível");
    expect(screen.getByTestId("faturamento-oficial-mercadolivre")).not.toHaveTextContent(/R\$/);
    abrir();
    expect(screen.getByRole("status")).toHaveTextContent(/Canal temporariamente indisponível/);
  });

  it("limpa o valor anterior enquanto os filtros estão atualizando", () => {
    montar({ dadosAtuais: false });
    expect(screen.getByTestId("faturamento-oficial-mercadolivre")).toHaveTextContent("Atualizando…");
    expect(screen.getByTestId("faturamento-oficial-mercadolivre")).not.toHaveTextContent(/R\$/);
    abrir();
    expect(screen.getByRole("status")).toHaveTextContent(/Aguardando os valores do CRM e do canal/);
  });

  it("sem datas não exibe moeda oficial", () => {
    montar({ periodo: { inicio: "", fim: "" } });
    expect(screen.getByTestId("faturamento-oficial-mercadolivre")).toHaveTextContent("Selecione o período");
    expect(screen.queryByText(/R\$/)).not.toBeInTheDocument();
  });

  it("preserva a composição local para canais sem consulta oficial", () => {
    montar({ canais: ["shopee"], faturamentoOficial: null });
    expect(screen.getByTestId("faturamento-atual-crm")).toHaveTextContent(/R\$\s*1\.000,00/);
    abrir(/entenda os totais do CRM/i);
    expect(screen.getByText(/O valor oficial do Shopee não é consultado/)).toBeInTheDocument();
  });

  it("não aparece quando há canais misturados ou nenhum selecionado", () => {
    const { container, rerender } = montar({ canais: [] });
    expect(container).toBeEmptyDOMElement();
    rerender(<ConferenciaCanal canais={["mercadolivre", "shopee"]} faturamento={1000} faturamentoOficial={oficial} canceladosValor={50} pendencias={{ quantidade: 0, valor: 0 }} periodo={{ inicio: "2026-08-24", fim: "2026-08-30" }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("não volta a prometer o indicador separado do painel", () => {
    montar();
    abrir();
    expect(screen.getByText(/não se apresenta como reprodução.*Vendas brutas/)).toBeInTheDocument();
    expect(screen.queryByText(/Esperado no painel|Deve bater/)).not.toBeInTheDocument();
  });
});
