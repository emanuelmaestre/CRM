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

  it("o painel de um mês só abre de fora a fora, colado nas duas bordas", () => {
    const restaurar = comLarguraDeCelular(390);
    try {
      render(<CalendarioPopoverRange rotulo="Período" valor={{ inicio: "", fim: "" }} onChange={vi.fn()} />);
      fireEvent.click(screen.getByRole("button", { name: "Período" }));

      expect(screen.getByRole("dialog")).toHaveStyle({ width: "390px", left: "0px" });
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

  it('"Mês passado" aplica o mês anterior inteiro, do dia 1 ao último', () => {
    const onChange = vi.fn();
    render(<CalendarioPopoverRange rotulo="Período" valor={{ inicio: "", fim: "" }} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Período" }));

    fireEvent.click(screen.getByRole("button", { name: "Mês passado" }));
    expect(onChange).toHaveBeenCalledWith({ inicio: "2026-07-01", fim: "2026-07-31" });
  });

  it("o atalho é aparado quando começa antes do min da tela", () => {
    const onChange = vi.fn();
    render(
      <CalendarioPopoverRange rotulo="Período" valor={{ inicio: "", fim: "" }} min="2026-07-15" onChange={onChange} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Período" }));

    fireEvent.click(screen.getByRole("button", { name: "Mês passado" }));
    expect(onChange).toHaveBeenCalledWith({ inicio: "2026-07-15", fim: "2026-07-31" });
  });

  it("atalho inteiramente fora dos limites fica desabilitado em vez de aplicar data inválida", () => {
    const onChange = vi.fn();
    render(
      <CalendarioPopoverRange rotulo="Período" valor={{ inicio: "", fim: "" }} min="2026-08-10" onChange={onChange} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Período" }));

    const mesPassado = screen.getByRole("button", { name: "Mês passado" });
    expect(mesPassado).toBeDisabled();
    fireEvent.click(mesPassado);
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
      <CalendarioPopoverRange rotulo="Período" valor={{ inicio: "2026-07-01", fim: "2026-07-31" }} onChange={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /01 de jul.*31 de jul/i }));

    expect(screen.getByRole("button", { name: "Mês passado" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Hoje" })).toHaveAttribute("aria-pressed", "false");
  });

  it("o título do mês sobe só a primeira letra, não a preposição", () => {
    render(<CalendarioPopoverRange rotulo="Período" valor={{ inicio: "", fim: "" }} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Período" }));

    // O `capitalize` do CSS subia cada palavra e saía "Agosto De 2026".
    expect(screen.getByText("Agosto de 2026")).toBeInTheDocument();
    expect(screen.queryByText("Agosto De 2026")).not.toBeInTheDocument();
  });

  it("no celular os cinco atalhos quebram linha em vez de rolar e cortar o último", () => {
    const restaurar = comLarguraDeCelular();
    try {
      render(<CalendarioPopoverRange rotulo="Período" valor={{ inicio: "", fim: "" }} onChange={vi.fn()} />);
      fireEvent.click(screen.getByRole("button", { name: "Período" }));

      const ultimo = screen.getByRole("button", { name: "Mês passado" });
      const fileira = ultimo.parentElement as HTMLElement;
      // Rolando na horizontal, "Mês passado" — o atalho mais pedido — ficava
      // cortado na borda da tela, sem pista de que havia mais coisa ali.
      expect(fileira.className).toContain("flex-wrap");
      expect(fileira.className).not.toContain("overflow-x-auto");
      for (const nome of ["Hoje", "7 dias", "30 dias", "Este mês", "Mês passado"]) {
        expect(screen.getByRole("button", { name: nome })).toBeInTheDocument();
      }
    } finally {
      restaurar();
    }
  });

  it("mostra quantos dias o intervalo cobre", () => {
    render(
      <CalendarioPopoverRange rotulo="Período" valor={{ inicio: "2026-07-01", fim: "2026-07-31" }} onChange={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /01 de jul.*31 de jul/i }));

    expect(screen.getByText(/·\s*31 dias/)).toBeInTheDocument();
  });
});
