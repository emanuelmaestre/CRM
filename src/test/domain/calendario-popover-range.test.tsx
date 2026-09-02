import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { CalendarioPopoverRange } from "@/shared/design-system/primitives/CalendarioPopoverRange";

/* Smoke test do calendário de intervalo que substituiu o par "De:"/"Até:" de
   dois `CalendarioPopover` — um clique fixa o início, o próximo fecha o fim
   e já aplica o filtro (sem botão "aplicar"), com um pulso de confirmação
   antes do painel fechar sozinho. Sem isso, um popover com bug de interação
   só apareceria em produção — não há erro de tipo nem de lint que pegue
   "o segundo clique não fechou o intervalo". */

describe("CalendarioPopoverRange", () => {
  // Sem intervalo selecionado, o popover abre no mês de "hoje" — fixar o
  // relógio evita que o teste vire flaky dependendo de que dia rodar.
  beforeEach(() => vi.useFakeTimers({ now: new Date(2026, 7, 15) }));
  afterEach(() => vi.useRealTimers());

  it("primeiro clique fixa o início, segundo clique fecha o fim e aplica o filtro", () => {
    const onChange = vi.fn();
    render(<CalendarioPopoverRange rotulo="Período" valor={{ inicio: "", fim: "" }} onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: "Período" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/agosto de 2026/i)).toBeInTheDocument();

    fireEvent.click(document.querySelector('[data-date="2026-08-10"]') as HTMLElement);
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText(/agora escolha a data final/i)).toBeInTheDocument();

    fireEvent.click(document.querySelector('[data-date="2026-08-20"]') as HTMLElement);
    expect(onChange).toHaveBeenCalledWith({ inicio: "2026-08-10", fim: "2026-08-20" });

    // O painel some sozinho depois do pulso de confirmação, não no instante
    // do clique — é o que dá o feedback de "aplicado e carregado". Ele sai
    // por trás de uma animação de saída (AnimatePresence), então o que o
    // pulso garante é o estado fechado, não a ausência imediata do nó.
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(400));
    expect(screen.getByRole("dialog")).toHaveStyle({ opacity: "0" });
  });

  it("escolher o fim antes do início inverte as datas automaticamente", () => {
    const onChange = vi.fn();
    render(<CalendarioPopoverRange rotulo="Período" valor={{ inicio: "", fim: "" }} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Período" }));

    fireEvent.click(document.querySelector('[data-date="2026-08-20"]') as HTMLElement);
    fireEvent.click(document.querySelector('[data-date="2026-08-10"]') as HTMLElement);

    expect(onChange).toHaveBeenCalledWith({ inicio: "2026-08-10", fim: "2026-08-20" });
  });

  it("bloqueia dias fora do intervalo min/max", () => {
    const onChange = vi.fn();
    render(
      <CalendarioPopoverRange rotulo="Período" valor={{ inicio: "", fim: "" }} min="2026-08-10" max="2026-08-20" onChange={onChange} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Período" }));

    const diaBloqueado = document.querySelector('[data-date="2026-08-05"]') as HTMLButtonElement;
    expect(diaBloqueado).toBeDisabled();

    fireEvent.click(diaBloqueado);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('"Limpar" esvazia o valor e fecha o painel', () => {
    const onChange = vi.fn();
    render(<CalendarioPopoverRange rotulo="Período" valor={{ inicio: "2026-08-10", fim: "2026-08-20" }} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /10 de ago.*20 de ago/i }));

    fireEvent.click(screen.getByRole("button", { name: "Limpar" }));
    expect(onChange).toHaveBeenCalledWith({ inicio: "", fim: "" });
    expect(screen.getByRole("dialog")).toHaveStyle({ opacity: "0" });
  });

  it('atalho "Hoje" aplica o dia atual como início e fim', () => {
    const onChange = vi.fn();
    render(<CalendarioPopoverRange rotulo="Período" valor={{ inicio: "", fim: "" }} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Período" }));

    fireEvent.click(screen.getByRole("button", { name: "Hoje" }));
    expect(onChange).toHaveBeenCalledWith({ inicio: "2026-08-15", fim: "2026-08-15" });
  });

  /* ── Painel de um mês só (celular) ────────────────────────────────────
     O jsdom nasce com 1024px de largura, então todo teste acima exercita o
     caminho de DOIS meses — e foi exatamente por isso que passou despercebido
     por tanto tempo que, com um mês só, o painel não tinha a seta de voltar:
     no desktop cada mês carrega uma seta, e as duas aparecem. */
  function comLarguraDeCelular(largura = 390) {
    const original = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { value: largura, configurable: true, writable: true });
    return () => Object.defineProperty(window, "innerWidth", { value: original, configurable: true, writable: true });
  }

  it("com um mês só na tela, o painel tem as DUAS setas e dá pra voltar de mês", () => {
    const restaurar = comLarguraDeCelular();
    try {
      render(<CalendarioPopoverRange rotulo="Período" valor={{ inicio: "", fim: "" }} onChange={vi.fn()} />);
      fireEvent.click(screen.getByRole("button", { name: "Período" }));

      expect(screen.getByText(/agosto de 2026/i)).toBeInTheDocument();
      // A de avançar sempre existiu; a de voltar é a que não era renderizada.
      expect(screen.getByRole("button", { name: "Próximo mês" })).toBeInTheDocument();
      const anterior = screen.getByRole("button", { name: "Mês anterior" });

      fireEvent.click(anterior);
      expect(screen.getByText(/julho de 2026/i)).toBeInTheDocument();
      fireEvent.click(anterior);
      expect(screen.getByText(/junho de 2026/i)).toBeInTheDocument();
    } finally {
      restaurar();
    }
  });

  /* O painel colava nas duas bordas da tela e parecia uma tela nova em vez de
     algo sobreposto. Agora e uma folha flutuante: recuo de 16px de cada lado,
     centralizada, com a pagina aparecendo em volta. */
  it("o painel de um mês só flutua, com respiro nas duas laterais", () => {
    const restaurar = comLarguraDeCelular(390);
    try {
      render(<CalendarioPopoverRange rotulo="Período" valor={{ inicio: "", fim: "" }} onChange={vi.fn()} />);
      fireEvent.click(screen.getByRole("button", { name: "Período" }));

      // 390 - 16 de cada lado = 358, centralizada em 16.
      expect(screen.getByRole("dialog")).toHaveStyle({ width: "358px", left: "16px" });
    } finally {
      restaurar();
    }
  });

  it("a folha nunca passa de 420px, mesmo num tablet estreito", () => {
    const restaurar = comLarguraDeCelular(640);
    try {
      render(<CalendarioPopoverRange rotulo="Período" valor={{ inicio: "", fim: "" }} onChange={vi.fn()} />);
      fireEvent.click(screen.getByRole("button", { name: "Período" }));

      expect(screen.getByRole("dialog")).toHaveStyle({ width: "420px", left: "110px" });
    } finally {
      restaurar();
    }
  });

  it("acima de 672px o painel continua ancorado no gatilho, não de fora a fora", () => {
    render(<CalendarioPopoverRange rotulo="Período" valor={{ inicio: "", fim: "" }} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Período" }));

    // 616px é a largura dos dois meses lado a lado — nunca os 1024 da viewport.
    expect(screen.getByRole("dialog")).toHaveStyle({ width: "616px" });
  });

  /* "Mês passado" saiu em 02/09/2026: sobraram quatro atalhos, que e quanto
     cabe numa fileira unica de larguras iguais. */
  it("os atalhos são exatamente quatro, todos terminando em hoje", () => {
    render(<CalendarioPopoverRange rotulo="Período" valor={{ inicio: "", fim: "" }} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Período" }));

    for (const nome of ["Hoje", "7 dias", "30 dias", "Este mês"]) {
      expect(screen.getByRole("button", { name: nome })).toBeInTheDocument();
    }
    expect(screen.queryByRole("button", { name: "Mês passado" })).not.toBeInTheDocument();
  });

  it('atalho "Este mês" vai do dia 1 até hoje', () => {
    const onChange = vi.fn();
    render(<CalendarioPopoverRange rotulo="Período" valor={{ inicio: "", fim: "" }} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Período" }));

    fireEvent.click(screen.getByRole("button", { name: "Este mês" }));
    expect(onChange).toHaveBeenCalledWith({ inicio: "2026-08-01", fim: "2026-08-15" });
  });

  it("o atalho é aparado quando começa antes do min da tela", () => {
    const onChange = vi.fn();
    render(
<CalendarioPopoverRange rotulo="Período" valor={{ inicio: "", fim: "" }} min="2026-07-20" onChange={onChange} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Período" }));

    // "30 dias" comecaria em 17/07; o min da tela empurra pra 20/07.
    fireEvent.click(screen.getByRole("button", { name: "30 dias" }));
    expect(onChange).toHaveBeenCalledWith({ inicio: "2026-07-20", fim: "2026-08-15" });
  });

  it("atalho inteiramente fora dos limites fica desabilitado em vez de aplicar data inválida", () => {
    const onChange = vi.fn();
    render(
      <CalendarioPopoverRange rotulo="Período" valor={{ inicio: "", fim: "" }} min="2026-08-20" onChange={onChange} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Período" }));

    // Hoje e 15/08 e a tela so aceita a partir de 20/08: o atalho inteiro cai
    // fora da faixa, entao ele desabilita em vez de aplicar data invalida.
    const hoje = screen.getByRole("button", { name: "Hoje" });
    expect(hoje).toBeDisabled();
    fireEvent.click(hoje);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("a seta de avançar trava quando o mês seguinte já passou do max", () => {
    const restaurar = comLarguraDeCelular();
    try {
      render(
        <CalendarioPopoverRange rotulo="Período" valor={{ inicio: "", fim: "" }} max="2026-08-20" onChange={vi.fn()} />,
      );
      fireEvent.click(screen.getByRole("button", { name: "Período" }));

      // Sem isto dava pra navegar até 2030 e encontrar 42 dias apagados.
      expect(screen.getByRole("button", { name: "Próximo mês" })).toBeDisabled();
      expect(screen.getByRole("button", { name: "Mês anterior" })).toBeEnabled();
    } finally {
      restaurar();
    }
  });

  it("o chip do atalho aplicado fica marcado como pressionado", () => {
    render(
      <CalendarioPopoverRange rotulo="Período" valor={{ inicio: "2026-08-01", fim: "2026-08-15" }} onChange={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /01 de ago.*15 de ago/i }));

    expect(screen.getByRole("button", { name: "Este mês" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Hoje" })).toHaveAttribute("aria-pressed", "false");
  });

  it("o título do mês sobe só a primeira letra, não a preposição", () => {
    render(<CalendarioPopoverRange rotulo="Período" valor={{ inicio: "", fim: "" }} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Período" }));

    // O `capitalize` do CSS subia cada palavra e saía "Agosto De 2026".
    expect(screen.getByText("Agosto de 2026")).toBeInTheDocument();
    expect(screen.queryByText("Agosto De 2026")).not.toBeInTheDocument();
  });

  it("no celular os quatro atalhos formam uma fileira única de larguras iguais", () => {
    const restaurar = comLarguraDeCelular();
    try {
      render(<CalendarioPopoverRange rotulo="Período" valor={{ inicio: "", fim: "" }} onChange={vi.fn()} />);
      fireEvent.click(screen.getByRole("button", { name: "Período" }));

      // Antes eram cinco pilulas de tamanhos diferentes: ou rolavam na
      // horizontal e cortavam a ultima, ou quebravam com um chip orfao embaixo.
      const fileira = screen.getByRole("button", { name: "Hoje" }).parentElement as HTMLElement;
      expect(fileira.className).toContain("grid-cols-4");
      expect(fileira.className).not.toContain("overflow-x-auto");
      expect(fileira.children).toHaveLength(4);
    } finally {
      restaurar();
    }
  });

  /* Na folha o rodape inteiro deixou de existir e o "Limpar" subiu pro
     cabecalho: uma barra so pra um link custava altura que agora mostra a
     pagina em volta do calendario. */
  it("no celular o Limpar vive no cabeçalho, e só aparece quando há o que limpar", () => {
    const restaurar = comLarguraDeCelular();
    try {
      const onChange = vi.fn();
      const { rerender } = render(<CalendarioPopoverRange rotulo="Período" valor={{ inicio: "", fim: "" }} onChange={onChange} />);
      fireEvent.click(screen.getByRole("button", { name: "Período" }));
      expect(screen.queryByRole("button", { name: "Limpar" })).not.toBeInTheDocument();

      rerender(<CalendarioPopoverRange rotulo="Período" valor={{ inicio: "2026-08-10", fim: "2026-08-20" }} onChange={onChange} />);
      fireEvent.click(screen.getByRole("button", { name: "Limpar" }));
      expect(onChange).toHaveBeenCalledWith({ inicio: "", fim: "" });
    } finally {
      restaurar();
    }
  });

  it("mostra quantos dias o intervalo cobre", () => {
    render(
      <CalendarioPopoverRange rotulo="Período" valor={{ inicio: "2026-07-01", fim: "2026-07-31" }} onChange={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /01 de jul.*31 de jul/i }));

    expect(screen.getByText("31 dias")).toBeInTheDocument();
  });

  /* ── Deslize lateral troca o mês (folha: celular e tablet) ──────────────
     Arrastar pra esquerda vai pro mês da frente, pra direita pro de trás. */
  function areaDosMeses(): HTMLElement {
    const area = screen.getByRole("dialog").querySelector<HTMLElement>(".touch-pan-y");
    if (!area) throw new Error("área dos meses não encontrada");
    return area;
  }

  function deslizar(dx: number, dy = 0, alvo?: HTMLElement) {
    const area = areaDosMeses();
    const origem = alvo ?? area;
    fireEvent.touchStart(area, { touches: [{ clientX: 200, clientY: 300 }] });
    fireEvent.touchEnd(area, { changedTouches: [{ clientX: 200 + dx, clientY: 300 + dy }] });
    // O navegador dispara o clique no elemento sob o dedo ao levantar.
    if (alvo) fireEvent.click(origem);
  }

  it("deslizar para a esquerda avança um mês; para a direita volta", () => {
    const restaurar = comLarguraDeCelular();
    try {
      render(<CalendarioPopoverRange rotulo="Período" valor={{ inicio: "", fim: "" }} onChange={vi.fn()} />);
      fireEvent.click(screen.getByRole("button", { name: "Período" }));
      expect(screen.getByText("Agosto de 2026")).toBeInTheDocument();

      deslizar(-120);
      expect(screen.getByText("Setembro de 2026")).toBeInTheDocument();

      deslizar(120);
      deslizar(120);
      expect(screen.getByText("Julho de 2026")).toBeInTheDocument();
    } finally {
      restaurar();
    }
  });

  it("toque curto ou movimento mais vertical que horizontal não troca o mês", () => {
    const restaurar = comLarguraDeCelular();
    try {
      render(<CalendarioPopoverRange rotulo="Período" valor={{ inicio: "", fim: "" }} onChange={vi.fn()} />);
      fireEvent.click(screen.getByRole("button", { name: "Período" }));

      deslizar(-20); // abaixo do mínimo: dedo tremido de quem só quis tocar
      expect(screen.getByText("Agosto de 2026")).toBeInTheDocument();

      deslizar(-80, 200); // rolagem torta da grade, não um deslize
      expect(screen.getByText("Agosto de 2026")).toBeInTheDocument();
    } finally {
      restaurar();
    }
  });

  it("o clique que fecha o deslize não seleciona a data sob o dedo", () => {
    const restaurar = comLarguraDeCelular();
    const onChange = vi.fn();
    try {
      render(<CalendarioPopoverRange rotulo="Período" valor={{ inicio: "", fim: "" }} onChange={onChange} />);
      fireEvent.click(screen.getByRole("button", { name: "Período" }));

      const dia = document.querySelector('[data-date="2026-08-12"]') as HTMLElement;
      deslizar(-120, 0, dia);

      expect(screen.getByText("Setembro de 2026")).toBeInTheDocument();
      expect(screen.getByText(/escolha a data inicial/i)).toBeInTheDocument();
      expect(onChange).not.toHaveBeenCalled();
    } finally {
      restaurar();
    }
  });

  it("com um início já fixado, arrastar pinta o intervalo em vez de trocar de mês", () => {
    const restaurar = comLarguraDeCelular();
    try {
      render(<CalendarioPopoverRange rotulo="Período" valor={{ inicio: "", fim: "" }} onChange={vi.fn()} />);
      fireEvent.click(screen.getByRole("button", { name: "Período" }));
      fireEvent.click(document.querySelector('[data-date="2026-08-10"]') as HTMLElement);

      deslizar(-120);
      expect(screen.getByText("Agosto de 2026")).toBeInTheDocument();
      expect(screen.getByText(/agora escolha a data final/i)).toBeInTheDocument();
    } finally {
      restaurar();
    }
  });

  it("o deslize respeita o limite: não passa do mês do max", () => {
    const restaurar = comLarguraDeCelular();
    try {
      render(
        <CalendarioPopoverRange rotulo="Período" valor={{ inicio: "", fim: "" }} max="2026-08-20" onChange={vi.fn()} />,
      );
      fireEvent.click(screen.getByRole("button", { name: "Período" }));

      deslizar(-120);
      expect(screen.getByText("Agosto de 2026")).toBeInTheDocument();
    } finally {
      restaurar();
    }
  });

  it("no desktop o deslize não troca o mês — lá as duas setas e os dois meses já resolvem", () => {
    render(<CalendarioPopoverRange rotulo="Período" valor={{ inicio: "", fim: "" }} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Período" }));
    expect(screen.getByText("Agosto de 2026")).toBeInTheDocument();

    deslizar(-120);
    expect(screen.getByText("Agosto de 2026")).toBeInTheDocument();
  });
});
