import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ConferenciaCanal } from "@/app/(dashboard)/vendas/pedidos/conferencia-canal";
import { consolidarDesempenhoML } from "@/modules/vendas/domain/desempenho-mercadolivre";

beforeEach(() => vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }));
afterEach(() => vi.unstubAllGlobals());

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
const desempenho = {
  atual: consolidarDesempenhoML([{ vendasBrutas: 1050, quantidadeVendas: 9, unidadesVendidas: 21, vendasCanceladas: 1, visitas: 200 }]),
  anterior: consolidarDesempenhoML([{ vendasBrutas: 1000, quantidadeVendas: 10, unidadesVendidas: 20, vendasCanceladas: 2, visitas: 200 }]),
  periodo: { inicio: "2026-08-24T04:00:00Z", fim: "2026-08-31T03:59:59.999Z" },
  periodoAnterior: { inicio: "2026-08-17T04:00:00Z", fim: "2026-08-24T03:59:59.999Z" },
  avisos: [],
};

function montar(props: Partial<React.ComponentProps<typeof ConferenciaCanal>> = {}) {
  return render(<ConferenciaCanal canais={["mercadolivre"]} faturamento={1000} faturamentoOficial={oficial} canceladosValor={50} pendencias={{ quantidade: 0, valor: 0 }} periodo={{ inicio: "2026-08-24", fim: "2026-08-30" }} {...props} />);
}

function abrir(nome: RegExp = /mercado livre ao vivo/i) {
  fireEvent.click(screen.getByRole("button", { name: nome }));
}

describe("faturamento oficial dos canais", () => {
  it("mostra a grade da Shopee com seis indicadores calculáveis e duas limitações explícitas", () => {
    montar({ canais: ["shopee"], faturamentoOficial: { ...oficial, desempenho: { ...desempenho, atual: { ...desempenho.atual, visitas: null, conversao: null }, anterior: { ...desempenho.anterior, visitas: null, conversao: null } } } });
    abrir(/shopee ao vivo/i);
    expect(screen.getAllByRole("button", { name: /Como é calculado:/ })).toHaveLength(8);
    expect(screen.getByTestId("desempenho-shopee-vendasBrutas")).toHaveTextContent(/1\.050,00/);
    expect(screen.getByTestId("desempenho-shopee-unidadesVendidas")).toHaveTextContent("21");
    expect(screen.getByTestId("desempenho-shopee-precoMedioUnidade")).toHaveTextContent(/50,00/);
    expect(screen.getByTestId("desempenho-shopee-quantidadeVendas")).toHaveTextContent("9");
    expect(screen.getByTestId("desempenho-shopee-precoMedioVenda")).toHaveTextContent(/116,67/);
    expect(screen.getByTestId("desempenho-shopee-vendasCanceladas")).toHaveTextContent("1");
    expect(screen.getByTestId("desempenho-shopee-visitas")).toHaveTextContent("Indisponível");
    expect(screen.getByTestId("desempenho-shopee-conversao")).toHaveTextContent("Indisponível");
    expect(screen.getAllByText("Sem fonte por período")).toHaveLength(2);
    expect(screen.getByText(/a cada 5 minutos/)).toBeInTheDocument();
    expect(screen.queryByText(/Calendário da API de visitas/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Como é calculado: Visitas" }));
    expect(screen.getByText(/A integração atual da Shopee não fornece visitas/)).toBeInTheDocument();
  });

  it("preserva a conferência da Shopee e não mistura a busca da lista com os cards", () => {
    montar({ canais: ["shopee"], temFiltrosAdicionais: true, faturamentoOficial: { ...oficial, desempenho } });
    abrir(/shopee ao vivo/i);
    expect(screen.getByText(/A busca e o filtro de status da lista não se aplicam aqui/)).toBeInTheDocument();
    expect(screen.getByText("CRM neste recorte")).toBeInTheDocument();
    expect(screen.queryByTestId("diferenca-faturamento")).not.toBeInTheDocument();
  });

  it("não mostra dados antigos da Shopee ao trocar os filtros", () => {
    montar({ canais: ["shopee"], dadosAtuais: false, faturamentoOficial: { ...oficial, desempenho } });
    abrir(/shopee ao vivo/i);
    expect(screen.queryByTestId("resumo-desempenho-shopee")).not.toBeInTheDocument();
  });

  it("exibe os oito indicadores reais dentro da conferência com comparação e fórmula acessível", () => {
    montar({ faturamentoOficial: { ...oficial, desempenho } });
    abrir();
    expect(screen.getAllByRole("button", { name: /Como é calculado:/ })).toHaveLength(8);
    expect(screen.getByTestId("desempenho-ml-vendasBrutas")).toHaveTextContent(/1\.050,00/);
    expect(screen.getByTestId("desempenho-ml-unidadesVendidas")).toHaveTextContent("21");
    expect(screen.getByTestId("desempenho-ml-precoMedioUnidade")).toHaveTextContent(/50,00/);
    expect(screen.getByTestId("desempenho-ml-visitas")).toHaveTextContent("200");
    expect(screen.getByTestId("desempenho-ml-quantidadeVendas")).toHaveTextContent("9");
    expect(screen.getByTestId("desempenho-ml-conversao")).toHaveTextContent("4,5%");
    expect(screen.getByTestId("desempenho-ml-precoMedioVenda")).toHaveTextContent(/116,67/);
    expect(screen.getByTestId("desempenho-ml-vendasCanceladas")).toHaveTextContent("1");
    expect(screen.getByText("-0,5 p.p.")).toBeInTheDocument();
    expect(screen.getByText(/Calendário da API de visitas: UTC−4/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Como é calculado: Conversão" }));
    expect(screen.getByText(/Quantidade de vendas dividida pelas visitas/)).toBeInTheDocument();
  });

  it("mantém seis cards disponíveis quando faltam visitas, sem conversão fictícia", () => {
    montar({ faturamentoOficial: { ...oficial, desempenho: { ...desempenho, atual: { ...desempenho.atual, visitas: null, conversao: null } } } });
    abrir();
    expect(screen.getByTestId("desempenho-ml-visitas")).toHaveTextContent("Indisponível");
    expect(screen.getByTestId("desempenho-ml-conversao")).toHaveTextContent("Indisponível");
    expect(screen.getByTestId("desempenho-ml-vendasBrutas")).toHaveTextContent(/1\.050,00/);
  });

  it("retira todos os indicadores do recorte antigo durante troca de filtro", () => {
    montar({ dadosAtuais: false, faturamentoOficial: { ...oficial, desempenho } });
    abrir();
    expect(screen.queryByTestId("resumo-desempenho-ml")).not.toBeInTheDocument();
  });
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

  it("não mostra zero local como se fosse o oficial quando o TikTok estiver indisponível", () => {
    montar({ canais: ["tiktokshop"], faturamentoOficial: { status: "indisponivel", mensagem: "TikTok Shop sem conexão válida." } });
    expect(screen.getByTestId("faturamento-oficial-tiktokshop")).toHaveTextContent("Indisponível");
    expect(screen.queryByTestId("faturamento-atual-crm")).not.toBeInTheDocument();
    abrir(/tiktok shop ao vivo/i);
    expect(screen.getByRole("status")).toHaveTextContent(/sem conexão válida/);
  });

  it("compara o TikTok Shop ao vivo quando a API oficial responde", () => {
    montar({ canais: ["tiktokshop"] });
    expect(screen.getByTestId("faturamento-oficial-tiktokshop")).toHaveTextContent(/R\$\s*1\.000,00/);
    abrir(/tiktok shop ao vivo/i);
    expect(screen.getByText("Diferença (CRM − TikTok Shop)")).toBeInTheDocument();
    expect(screen.getByText(/está igual ao TikTok Shop/)).toBeInTheDocument();
    expect(screen.getByText(/endpoint oficial de pedidos do TikTok Shop/)).toBeInTheDocument();
  });

  it("mostra a Shopee ao vivo com a mesma comparação do Mercado Livre", () => {
    montar({ canais: ["shopee"] });
    expect(screen.getByRole("button", { name: /shopee ao vivo/i })).toBeInTheDocument();
    expect(screen.getByTestId("faturamento-oficial-shopee")).toHaveTextContent(/R\$\s*1\.000,00/);
    expect(screen.queryByText(/Faturamento atual no CRM/)).not.toBeInTheDocument();
    abrir(/shopee ao vivo/i);
    expect(screen.getByText("Diferença (CRM − Shopee)")).toBeInTheDocument();
    expect(screen.getByText(/está igual à Shopee neste momento/)).toBeInTheDocument();
    expect(screen.getByText(/APIs oficiais de pedidos e financeiro da Shopee/)).toBeInTheDocument();
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
    expect(screen.getByText(/não se apresenta como reprodução de indicadores separados do painel oficial/)).toBeInTheDocument();
    expect(screen.queryByText(/Esperado no painel|Deve bater/)).not.toBeInTheDocument();
  });
});
