import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ConferenciaCanal } from "@/app/(dashboard)/vendas/pedidos/conferencia-canal";

function montar(props: Partial<React.ComponentProps<typeof ConferenciaCanal>> = {}) {
  return render(<ConferenciaCanal canais={["mercadolivre"]} faturamento={1000} canceladosValor={50} pendencias={{ quantidade: 0, valor: 0 }} periodo={{ inicio: "2026-08-24", fim: "2026-08-30" }} {...props} />);
}
function abrir() { fireEvent.click(screen.getByRole("button", { name: /entenda os totais do CRM/i })); }

describe("composição local sem falsa conciliação", () => {
  it("não apresenta valor esperado do painel oficial no cabeçalho", () => {
    montar();
    expect(screen.getByText(/não são uma conferência com o painel oficial/)).toBeInTheDocument();
    expect(screen.queryByText(/Esperado no painel|Deve bater/)).not.toBeInTheDocument();
    expect(screen.queryByText(/R\$/)).not.toBeInTheDocument();
  });
  it("identifica as datas exatas e o fuso sem abrir o calendário", () => {
    montar();
    expect(screen.getByText(/24\/08\/2026 a 30\/08\/2026 · horário de Brasília/)).toBeInTheDocument();
  });
  it("não soma o valor de pedidos pendentes ao total importado", () => {
    montar({ pendencias: { quantidade: 2, valor: 300 } }); abrir();
    expect(screen.getByText("Total dos pedidos importados neste recorte")).toBeInTheDocument();
    expect(screen.getByText(/R\$\s*1\.050,00/)).toBeInTheDocument();
    expect(screen.queryByText(/R\$\s*1\.350,00/)).not.toBeInTheDocument();
    expect(screen.getByText(/2 pendência\(s\).*não são somados/)).toBeInTheDocument();
  });
  it("não transforma fila vazia em garantia de completude", () => {
    montar(); abrir();
    expect(screen.getByText(/Isso não comprova que todos os pedidos foram recebidos/)).toBeInTheDocument();
    expect(screen.queryByText(/Nenhuma venda do período ficou de fora/)).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /inclusive sem data/i })).toHaveAttribute("href", "/vendas/pedidos-ignorados");
  });
  it("não atribui automaticamente a diferença a fuso ou atraso", () => {
    montar(); abrir();
    expect(screen.getByText(/O valor do painel oficial não foi consultado/)).toHaveTextContent(/não são atribuídas automaticamente a horário ou atraso/);
    expect(screen.queryByText(/Virada do dia|Deve bater com o painel/)).not.toBeInTheDocument();
  });
  it("também não promete reproduzir o painel da Shopee", () => {
    montar({ canais: ["shopee"] }); abrir();
    expect(screen.getByText(/não representa o valor recebido nem o indicador oficial do Shopee/)).toBeInTheDocument();
    expect(screen.queryByText(/Esperado no painel/)).not.toBeInTheDocument();
  });
  it("não aparece quando há canais misturados ou nenhum selecionado", () => {
    const { container, rerender } = montar({ canais: [] });
    expect(container).toBeEmptyDOMElement();
    rerender(<ConferenciaCanal canais={["mercadolivre", "shopee"]} faturamento={1000} canceladosValor={50} pendencias={{ quantidade: 0, valor: 0 }} periodo={{ inicio: "2026-08-24", fim: "2026-08-30" }} />);
    expect(container).toBeEmptyDOMElement();
  });
  it("sem datas não exibe uma soma para comparação", () => {
    montar({ periodo: { inicio: "", fim: "" } }); abrir();
    expect(screen.getByText(/Escolha um período/)).toBeInTheDocument();
    expect(screen.queryByText(/R\$/)).not.toBeInTheDocument();
  });
  it("avisa quando busca ou status restringem o total", () => {
    montar({ temFiltrosAdicionais: true }); abrir();
    expect(screen.getByText(/limpe a busca e selecione Todos/)).toBeInTheDocument();
  });
  it("não apresenta a soma anterior enquanto os filtros atuais não têm resposta válida", () => {
    montar({ dadosAtuais: false }); abrir();
    expect(screen.getByRole("status")).toHaveTextContent(/Aguardando dados atualizados/);
    expect(screen.queryByText(/R\$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Nenhuma pendência/)).not.toBeInTheDocument();
  });
});
