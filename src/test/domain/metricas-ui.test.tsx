import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ScoreCard } from "@/app/(dashboard)/metricas/score-card";
import { ComparacaoCard } from "@/app/(dashboard)/metricas/comparacao-card";
import { PublicacoesCard } from "@/app/(dashboard)/metricas/publicacoes-card";
import { ReputacaoCard } from "@/app/(dashboard)/metricas/reputacao-card";
import { BarraComLimite } from "@/app/(dashboard)/metricas/metricas-primitives";
import type { SaudeLojaResultado, SaudeMarca } from "@/modules/metricas/application/saude-loja.service";
import type { DesempenhoPublicacoesResultado } from "@/modules/metricas/application/publicacoes.service";
import { CalculoPopover } from "@/shared/design-system/primitives/CalculoPopover";

const obterPublicacoes = vi.fn();
vi.mock("@/app/(dashboard)/metricas/actions", () => ({
  actionObterDesempenhoPublicacoes: (...args: unknown[]) => obterPublicacoes(...args),
}));

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
      { chave: "estoque", label: "Estoque", descricao: "d", peso: 10, nota: 55, detalhe: "5 de 10 com saldo" },
    ],
    pilaresMedidos: 3,
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
    expect(gatilho).toHaveClass("[@media(pointer:coarse)]:min-h-11");
    expect(gatilho).toHaveClass("[@media(pointer:coarse)]:min-w-11");
    fireEvent.click(gatilho);

    expect(await screen.findByText("O que significa")).toBeInTheDocument();
    expect(screen.getByText("Como é calculado")).toBeInTheDocument();
    expect(screen.getByText("Dados usados")).toBeInTheDocument();
    expect(screen.getByText("Período analisado")).toBeInTheDocument();
    expect(screen.getByText("Importante")).toBeInTheDocument();
    expect(screen.getByText("Mostra a parcela das perguntas que recebeu resposta.")).toBeInTheDocument();

    const popover = document.querySelector("[data-radix-popper-content-wrapper] > div");
    expect(popover).toHaveClass("max-h-[var(--radix-popover-content-available-height)]");
    expect(popover).toHaveClass("overflow-y-auto");
    expect(popover).toHaveClass("scrollbar-none");
    const colunas = screen.getByText("O que significa").parentElement?.parentElement?.parentElement;
    expect(colunas).toHaveClass("lg:grid-cols-2");
    expect(colunas).not.toHaveClass("sm:grid-cols-2");
  });

  it("mostra o score consolidado e admite a leitura parcial da marca", async () => {
    render(<ScoreCard dados={resultado()} carregando={false} />);

    expect(screen.getByRole("img", { name: /pontuação 78 de 100, saudável/i })).toBeInTheDocument();

    // Abrir a marca revela os pilares — e o aviso de que só 3 dos 4 têm dado.
    screen.getByRole("tab", { name: /karzi/i }).click();
    expect(await screen.findByText(/de 4 pilares com dado/i)).toBeInTheDocument();
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
    // Reclamações foram removidas do produto e não devem reaparecer por
    // dados legados ainda presentes no contrato de saúde.
    expect(screen.queryByText("2 (1 em mediação)")).not.toBeInTheDocument();
  });

  it("mostra somente métricas patrocinadas do período e separa publicações sem veiculação", async () => {
    const brandId = "11111111-1111-4111-8111-111111111111";
    const base = {
      status: "active",
      ctr: 0.86,
      cvr: 9.01,
      qualidade: 80,
      nivelQualidade: "Profesional",
      qualidadeStatus: "disponivel" as const,
      pendencias: [],
      dataCriacao: "2026-05-10T12:00:00.000Z",
    };
    const dados: DesempenhoPublicacoesResultado = {
      periodo: { inicio: "2026-06-01", fim: "2026-08-21" },
      parcial: false,
      resumo: {
        totalPublicacoes: 3,
        comVeiculacao: 2,
        semVeiculacao: 1,
        investimento: 61.59,
        receita: 155.16,
        unidadesAtribuidas: 10,
      },
      itens: [
        {
          ...base,
          itemId: "MLB4613201381",
          titulo: "Anúncio com retorno",
          impressoes: 12_859,
          cliques: 111,
          unidadesAtribuidas: 10,
          investimento: 48.32,
          receita: 155.16,
        },
        {
          ...base,
          itemId: "MLB6631903384",
          titulo: "Anúncio sem venda atribuída",
          impressoes: 12_557,
          cliques: 58,
          unidadesAtribuidas: 0,
          investimento: 13.27,
          receita: 0,
        },
      ],
      semVeiculacao: [{
        ...base,
        itemId: "MLB4806793213",
        titulo: "Anúncio realmente zerado",
        status: "idle",
        impressoes: 0,
        cliques: 0,
        unidadesAtribuidas: 0,
        ctr: null,
        cvr: null,
        investimento: 0,
        receita: 0,
        qualidade: null,
        nivelQualidade: null,
        qualidadeStatus: "nao_consultada",
      }],
    };
    obterPublicacoes.mockResolvedValue(dados);

    render(<PublicacoesCard
      marcas={[{ brandId, marcaLabel: "KARZI", slug: "karzi" }]}
      inicio="2026-06-01"
      fim="2026-08-21"
    />);

    // Sem seleção não há consulta nem spinner permanente: a tela explica os
    // dois passos e só começa a buscar depois de marca + canal.
    expect(screen.getByText(/selecione uma marca e depois ative o mercado livre/i)).toBeInTheDocument();
    expect(screen.queryByLabelText("Contagem ainda não consultada")).not.toBeInTheDocument();
    expect(obterPublicacoes).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("switch", { name: /mercado livre/i }));
    expect(screen.getByRole("switch", { name: /karzi/i })).toHaveAttribute("aria-checked", "true");
    expect(await screen.findAllByText("Impressões")).not.toHaveLength(0);
    expect(screen.getAllByText("Cliques").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Investimento").length).toBeGreaterThan(0);
    expect(screen.getByText("3.2x")).toBeInTheDocument();
    expect(screen.getByText("0.0x")).toBeInTheDocument();
    expect(screen.queryByText("Visitas")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Entenda o indicador Publicações patrocinadas" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Entenda o indicador Publicações com veiculação" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Entenda o indicador Situação da veiculação" })).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: "Entenda o indicador Retorno consolidado do período" }));
    expect(screen.getByText(/não a média simples dos retornos individuais/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /1 publicação sem veiculação/i }));
    expect(screen.getByText("Anúncio realmente zerado")).toBeInTheDocument();
  });

  it("BarraComLimite não espelha a barra quando o valor é negativo", () => {
    const { container } = render(<BarraComLimite valor={-15} maximo={40} cor="var(--destructive)" />);
    const preenchimento = container.querySelector(".rounded-l-full") as HTMLElement;
    // scaleX negativo faria o CSS espelhar a barra para o lado errado em vez
    // de mostrá-la vazia — o piso em 0 garante scaleX(0), nunca negativo.
    expect(preenchimento.style.transform).toContain("scaleX(0)");
  });
});
