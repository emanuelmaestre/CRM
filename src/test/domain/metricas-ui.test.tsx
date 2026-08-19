import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ScoreCard } from "@/app/(dashboard)/metricas/score-card";
import { AtendimentoCard } from "@/app/(dashboard)/metricas/atendimento-card";
import { ComparacaoCard } from "@/app/(dashboard)/metricas/comparacao-card";
import { ReputacaoCard } from "@/app/(dashboard)/metricas/reputacao-card";
import { BarraComLimite } from "@/app/(dashboard)/metricas/metricas-primitives";
import type { SaudeLojaResultado, SaudeMarca } from "@/modules/metricas/application/saude-loja.service";
import type { AtendimentoResumo } from "@/modules/metricas/application/atendimento.service";
import { CalculoPopover } from "@/shared/design-system/primitives/CalculoPopover";

class ResizeObserverMock implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

globalThis.ResizeObserver ??= ResizeObserverMock;

/* Render de verdade dos cards de Métricas. O que se protege aqui é a promessa
   central da tela: dado ausente aparece como ausente, nunca como zero. É o tipo
   de regressão que passa despercebida — um "—" virando "0" não quebra teste
   nenhum, só passa a mentir para quem lê. */

function marca(parcial: Partial<SaudeMarca> = {}): SaudeMarca {
  return {
    brandId: "11111111-1111-4111-8111-111111111111",
    marca: "karzi",
    marcaLabel: "KARZI",
    score: 78,
    faixaLabel: "Saudável",
    faixaCor: "var(--escala-4)",
    pilares: [
      { chave: "reputacao", label: "Reputação", descricao: "d", peso: 30, nota: 100, detalhe: "Termômetro Verde" },
      { chave: "posVenda", label: "Pós-venda", descricao: "d", peso: 25, nota: 80, detalhe: "Dentro do limite" },
      { chave: "satisfacao", label: "Satisfação", descricao: "d", peso: 20, nota: null, detalhe: "Nenhum anúncio avaliado ainda" },
      { chave: "atendimento", label: "Atendimento", descricao: "d", peso: 15, nota: 60, detalhe: "90% respondidas" },
      { chave: "estoque", label: "Estoque", descricao: "d", peso: 10, nota: 55, detalhe: "5 de 10 com saldo" },
    ],
    pilaresMedidos: 4,
    faturamento: 12000,
    faturamentoLabel: "R$ 12.000,00",
    pedidos: 40,
    ticketMedio: 300,
    ticketMedioLabel: "R$ 300,00",
    notaMedia: null,
    totalAvaliacoes: 0,
    reclamacoesAbertas: 2,
    emMediacao: 1,
    reputacao: null,
    atendimento: null,
    taxaCancelamento: null,
    totalPedidosBrutos: 0,
    pedidosCanceladosOuDevolvidos: 0,
    concentracaoTop5: null,
    receitaTotalConcentracao: 0,
    receitaTop5: 0,
    taxaRecorrencia: null,
    receitaTotalRecorrencia: 0,
    receitaRecorrente: 0,
    ...parcial,
  };
}

function resultado(parcial: Partial<SaudeLojaResultado> = {}): SaudeLojaResultado {
  return {
    marcas: [marca()],
    scoreGeral: 78,
    faixaGeralLabel: "Saudável",
    faixaGeralCor: "var(--escala-4)",
    periodoLabel: "16/07 – 14/08",
    reputacaoIndisponivel: false,
    marcasComFalha: [],
    contasDesconectadas: [],
    ...parcial,
  };
}

describe("cards de Métricas", () => {
  it("explica cada indicador em linguagem de negócio e mostra a origem do cálculo", async () => {
    render(
      <CalculoPopover
        titulo="Taxa de resposta"
        significado="Mostra a parcela das perguntas que recebeu resposta."
        formula="perguntas respondidas divididas pelas perguntas recebidas"
        resultado="80%"
        periodoLabel="01/08 a 15/08"
        itens={[
          { label: "Respondidas", valor: "8", fracao: 0.8 },
          { label: "Recebidas", valor: "10" },
        ]}
        nota="Mensagens seguidas do mesmo cliente formam um único turno."
      />,
    );

    const gatilho = screen.getByRole("button", { name: "Entenda o indicador Taxa de resposta" });
    expect(gatilho).toHaveAttribute("title", "Entenda o indicador: Taxa de resposta");
    fireEvent.click(gatilho);

    expect(await screen.findByText("O que significa")).toBeInTheDocument();
    expect(screen.getByText("Como é calculado")).toBeInTheDocument();
    expect(screen.getByText("Dados usados")).toBeInTheDocument();
    expect(screen.getByText("Período analisado")).toBeInTheDocument();
    expect(screen.getByText("Importante")).toBeInTheDocument();
    expect(screen.getByText("Mostra a parcela das perguntas que recebeu resposta.")).toBeInTheDocument();
  });

  it("mostra o score consolidado e admite a leitura parcial da marca", async () => {
    render(<ScoreCard dados={resultado()} carregando={false} />);

    expect(screen.getByRole("img", { name: /score 78 de 100, saudável/i })).toBeInTheDocument();

    // Abrir a marca revela os pilares — e o aviso de que só 4 dos 5 têm dado.
    screen.getByRole("tab", { name: /karzi/i }).click();
    expect(await screen.findByText(/de 5 pilares com dado/i)).toBeInTheDocument();
    // A troca de escopo passa por AnimatePresence mode="wait": a lista de
    // pilares só monta depois de a visão consolidada sair, então espera-se por
    // ela em vez de exigi-la no mesmo tick.
    expect(await screen.findByText("Nenhum anúncio avaliado ainda")).toBeInTheDocument();
  });

  it("não inventa reputação quando nenhuma conta está conectada", () => {
    render(<ReputacaoCard dados={resultado({ reputacaoIndisponivel: true })} carregando={false} />);
    expect(screen.getByText(/nenhuma conta do mercado livre conectada/i)).toBeInTheDocument();
  });

  it("explica quando uma conta caiu, em vez de a marca só sumir da lista", () => {
    render(<ReputacaoCard dados={resultado({
      reputacaoIndisponivel: true,
      contasDesconectadas: [{
        brandId: "22222222-2222-4222-8222-222222222222",
        marcaLabel: "WUWU",
        status: "desconectado",
        ultimoErro: "Token OAuth expirado",
        ultimaVerificacao: "2026-08-10T12:00:00.000Z",
      }],
    })} carregando={false} />);
    expect(screen.getByText(/wuwu · conta desconectada/i)).toBeInTheDocument();
    expect(screen.getByText("Token OAuth expirado")).toBeInTheDocument();
    // Com um motivo concreto na tela, o convite genérico de "conecte uma
    // conta" não deveria aparecer — seria redundante com o aviso específico.
    expect(screen.queryByText(/nenhuma conta do mercado livre conectada/i)).not.toBeInTheDocument();
  });

  it("escreve nota ausente como texto explicativo, nunca como zero", () => {
    render(<ComparacaoCard dados={resultado()} carregando={false} />);
    const nota = screen.getByText("Nota").closest("div");
    expect(within(nota as HTMLElement).getByText("Sem avaliação")).toBeInTheDocument();
    // Reclamação em mediação continua visível ao lado do total.
    expect(screen.getByText("2 (1 em mediação)")).toBeInTheDocument();
  });

  it("resume o funil de atendimento pelas faixas de espera", () => {
    const atendimento: AtendimentoResumo = {
      perguntas: 10,
      respondidas: 8,
      taxaResposta: 80,
      medianaSegundos: 5400,
      medianaLabel: "1h30",
      variacaoTaxaResposta: 5,
      taxaRespostaAnterior: 75,
      faixas: [
        { chave: "ate1h", label: "Até 1 hora", cor: "var(--success)", quantidade: 4, participacao: 40 },
        { chave: "ate4h", label: "1 a 4 horas", cor: "var(--escala-4)", quantidade: 3, participacao: 30 },
        { chave: "ate24h", label: "4 a 24 horas", cor: "var(--warning)", quantidade: 1, participacao: 10 },
        { chave: "acima24h", label: "Mais de 24 horas", cor: "var(--escala-2)", quantidade: 0, participacao: 0 },
        { chave: "semResposta", label: "Sem resposta", cor: "var(--destructive)", quantidade: 2, participacao: 20 },
      ],
      porCanal: [
        { canal: "mercadolivre", perguntas: 6, taxaResposta: 70, medianaSegundos: 7200, medianaLabel: "2h" },
        { canal: "whatsapp", perguntas: 4, taxaResposta: 95, medianaSegundos: 1200, medianaLabel: "20min" },
      ],
    };
    render(<AtendimentoCard dados={atendimento} carregando={false} />);

    expect(screen.getByText("1h30")).toBeInTheDocument();
    expect(screen.getByText("Sem resposta")).toBeInTheDocument();
    // Só o Mercado Livre carrega a badge de reputação — WhatsApp não deveria.
    expect(screen.getAllByText(/afeta reputação/i)).toHaveLength(1);
    // A variação vem em pontos percentuais, não em "%": confundir os dois é o
    // erro clássico de leitura de taxa sobre taxa.
    expect(screen.getByText(/\+5 p\.p\./)).toBeInTheDocument();
  });

  it("diz que não há dado em vez de desenhar um funil vazio", () => {
    render(<AtendimentoCard dados={null} carregando={false} />);
    expect(screen.getByText(/nenhuma mensagem de cliente no período/i)).toBeInTheDocument();
  });

  it("BarraComLimite não espelha a barra quando o valor é negativo", () => {
    const { container } = render(<BarraComLimite valor={-15} maximo={40} cor="var(--destructive)" />);
    const preenchimento = container.querySelector(".rounded-l-full") as HTMLElement;
    // scaleX negativo faria o CSS espelhar a barra para o lado errado em vez
    // de mostrá-la vazia — o piso em 0 garante scaleX(0), nunca negativo.
    expect(preenchimento.style.transform).toContain("scaleX(0)");
  });
});
